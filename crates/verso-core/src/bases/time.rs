// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

//! Dates and durations of the base language. A date is a wall-clock time in
//! the user's zone, held as milliseconds since 1970-01-01T00:00 of that
//! clock — the zone itself is not kept: the window gives its offset with
//! each query, and a file's times are moved by it once, when read. That is
//! what Obsidian shows (Moment, in local time); a zone's change of offset
//! between two dates (daylight saving) is not modelled.

pub(crate) const MS_PER_SECOND: i64 = 1_000;
pub(crate) const MS_PER_MINUTE: i64 = 60 * MS_PER_SECOND;
pub(crate) const MS_PER_HOUR: i64 = 60 * MS_PER_MINUTE;
pub(crate) const MS_PER_DAY: i64 = 24 * MS_PER_HOUR;

/// Days from 1970-01-01 to `y-m-d` of the proleptic Gregorian calendar
/// (Howard Hinnant's `days_from_civil`).
pub(crate) fn days_from_civil(y: i64, m: u32, d: u32) -> i64 {
    let y = if m <= 2 { y - 1 } else { y };
    let era = y.div_euclid(400);
    let yoe = y - era * 400;
    let m = i64::from(m);
    let mp = (m + 9) % 12;
    let doy = (153 * mp + 2) / 5 + i64::from(d) - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146_097 + doe - 719_468
}

/// The calendar date of a day count from 1970-01-01.
pub(crate) fn civil_from_days(z: i64) -> (i64, u32, u32) {
    let z = z + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    (
        y,
        u32::try_from(m).unwrap_or(1),
        u32::try_from(d).unwrap_or(1),
    )
}

pub(crate) fn days_in_month(y: i64, m: u32) -> u32 {
    match m {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        _ if (y % 4 == 0 && y % 100 != 0) || y % 400 == 0 => 29,
        _ => 28,
    }
}

/// The parts of a wall-clock time.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct Parts {
    pub year: i64,
    pub month: u32,
    pub day: u32,
    pub hour: u32,
    pub minute: u32,
    pub second: u32,
    pub millisecond: u32,
    /// 0 for Sunday.
    pub weekday: u32,
}

pub(crate) fn parts(ms: i64) -> Parts {
    let days = ms.div_euclid(MS_PER_DAY);
    let rest = ms.rem_euclid(MS_PER_DAY);
    let (year, month, day) = civil_from_days(days);
    let part = |v: i64| u32::try_from(v).unwrap_or(0);
    Parts {
        year,
        month,
        day,
        hour: part(rest / MS_PER_HOUR),
        minute: part(rest % MS_PER_HOUR / MS_PER_MINUTE),
        second: part(rest % MS_PER_MINUTE / MS_PER_SECOND),
        millisecond: part(rest % MS_PER_SECOND),
        // 1970-01-01 was a Thursday.
        weekday: part((days + 4).rem_euclid(7)),
    }
}

pub(crate) fn from_parts(y: i64, mo: u32, d: u32, h: u32, mi: u32, s: u32, ms: u32) -> i64 {
    days_from_civil(y, mo, d) * MS_PER_DAY
        + i64::from(h) * MS_PER_HOUR
        + i64::from(mi) * MS_PER_MINUTE
        + i64::from(s) * MS_PER_SECOND
        + i64::from(ms)
}

/// A date written as Obsidian's properties write them — `2024-05-27`,
/// `2024-05-27T10:30:00`, `2024-05-27 10:30` — and as ISO 8601 with
/// seconds' fractions and a zone. Returns the wall-clock time and whether
/// the text had a time. A zone moves the time to the user's, by `offset`
/// minutes east of UTC.
pub(crate) fn parse_date(text: &str, offset_minutes: i32) -> Option<(i64, bool)> {
    let s = text.trim();
    let b = s.as_bytes();
    let digits = |from: usize, n: usize| -> Option<u32> {
        let part = s.get(from..from + n)?;
        if part.bytes().all(|c| c.is_ascii_digit()) {
            part.parse().ok()
        } else {
            None
        }
    };
    if b.len() < 10 || b[4] != b'-' || b[7] != b'-' {
        return None;
    }
    let year = i64::from(digits(0, 4)?);
    let month = digits(5, 2)?;
    let day = digits(8, 2)?;
    if !(1..=12).contains(&month) || day == 0 || day > days_in_month(year, month) {
        return None;
    }
    if b.len() == 10 {
        return Some((from_parts(year, month, day, 0, 0, 0, 0), false));
    }
    if b[10] != b'T' && b[10] != b' ' {
        return None;
    }
    let hour = digits(11, 2)?;
    if b.get(13) != Some(&b':') {
        return None;
    }
    let minute = digits(14, 2)?;
    let mut at = 16;
    let mut second = 0;
    let mut millis = 0;
    if b.get(at) == Some(&b':') {
        second = digits(at + 1, 2)?;
        at += 3;
        if b.get(at) == Some(&b'.') {
            let start = at + 1;
            let mut end = start;
            while end < b.len() && b[end].is_ascii_digit() {
                end += 1;
            }
            let frac = s.get(start..end)?;
            if frac.is_empty() {
                return None;
            }
            let three: String = frac.chars().chain(std::iter::repeat('0')).take(3).collect();
            millis = three.parse().ok()?;
            at = end;
        }
    }
    if hour > 23 || minute > 59 || second > 59 {
        return None;
    }
    let local = from_parts(year, month, day, hour, minute, second, millis);
    let zone = s.get(at..)?;
    let utc_offset = match zone {
        "" => return Some((local, true)),
        "Z" | "z" => 0,
        z if (z.starts_with('+') || z.starts_with('-')) && (z.len() == 6 || z.len() == 5) => {
            let sign = if z.starts_with('-') { -1 } else { 1 };
            let body = z.get(1..)?.replace(':', "");
            if body.len() != 4 || !body.bytes().all(|c| c.is_ascii_digit()) {
                return None;
            }
            let h: i64 = body.get(0..2)?.parse().ok()?;
            let m: i64 = body.get(2..4)?.parse().ok()?;
            sign * (h * 60 + m)
        }
        _ => return None,
    };
    let utc = local - utc_offset * MS_PER_MINUTE;
    Some((utc + i64::from(offset_minutes) * MS_PER_MINUTE, true))
}

/// A duration: calendar months (which have no fixed length) and a fixed
/// number of milliseconds.
#[derive(Debug, Clone, Copy, PartialEq)]
pub(crate) struct Duration {
    pub months: f64,
    pub ms: f64,
}

/// `"1d"`, `"2 hours"`, `"1M"`, `"-3w"`, `"1y 2M"`: units as "Bases syntax"
/// lists them — `y`, `M`, `d`, `w`, `h`, `m`, `s` and their names; `M` is
/// a month and `m` a minute.
pub(crate) fn parse_duration(text: &str) -> Option<Duration> {
    let mut out = Duration {
        months: 0.0,
        ms: 0.0,
    };
    let mut rest = text.trim();
    if rest.is_empty() {
        return None;
    }
    while !rest.is_empty() {
        let sign = if let Some(r) = rest.strip_prefix('-') {
            rest = r.trim_start();
            -1.0
        } else if let Some(r) = rest.strip_prefix('+') {
            rest = r.trim_start();
            1.0
        } else {
            1.0
        };
        let num_end = rest
            .find(|c: char| !(c.is_ascii_digit() || c == '.'))
            .unwrap_or(rest.len());
        let n: f64 = rest.get(..num_end)?.parse().ok()?;
        rest = rest.get(num_end..)?.trim_start();
        let unit_end = rest
            .find(|c: char| !c.is_alphabetic())
            .unwrap_or(rest.len());
        let unit = rest.get(..unit_end)?;
        rest = rest.get(unit_end..)?.trim_start();
        let n = n * sign;
        match unit {
            "y" | "year" | "years" => out.months += n * 12.0,
            "M" | "month" | "months" => out.months += n,
            "w" | "week" | "weeks" => out.ms += n * 7.0 * 86_400_000.0,
            "d" | "day" | "days" => out.ms += n * 86_400_000.0,
            "h" | "hour" | "hours" => out.ms += n * 3_600_000.0,
            "m" | "minute" | "minutes" => out.ms += n * 60_000.0,
            "s" | "second" | "seconds" => out.ms += n * 1_000.0,
            _ => return None,
        }
    }
    Some(out)
}

/// `ms` moved by `d`: its months first, on the calendar, the day kept or
/// brought back to the month's last; then its fixed part.
pub(crate) fn add(ms: i64, d: Duration) -> i64 {
    let mut t = ms;
    let whole = d.months.trunc() as i64;
    if whole != 0 {
        let p = parts(t);
        let total = p.year * 12 + i64::from(p.month) - 1 + whole;
        let year = total.div_euclid(12);
        let month = u32::try_from(total.rem_euclid(12) + 1).unwrap_or(1);
        let day = p.day.min(days_in_month(year, month));
        t = from_parts(year, month, day, p.hour, p.minute, p.second, p.millisecond);
    }
    let fraction = d.months.fract() * 30.0 * 86_400_000.0;
    t + (d.ms + fraction).round() as i64
}

const MONTHS_EN: [&str; 12] = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
];
const MONTHS_PT: [&str; 12] = [
    "janeiro",
    "fevereiro",
    "março",
    "abril",
    "maio",
    "junho",
    "julho",
    "agosto",
    "setembro",
    "outubro",
    "novembro",
    "dezembro",
];
const DAYS_EN: [&str; 7] = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
];
const DAYS_PT: [&str; 7] = [
    "domingo",
    "segunda-feira",
    "terça-feira",
    "quarta-feira",
    "quinta-feira",
    "sexta-feira",
    "sábado",
];

fn portuguese(lang: &str) -> bool {
    lang.to_ascii_lowercase().starts_with("pt")
}

/// `ms` in a Moment.js format: `YYYY`, `YY`, `M`, `MM`, `MMM`, `MMMM`, `D`,
/// `DD`, `Do`, `d`, `dd`, `ddd`, `dddd`, `H`, `HH`, `h`, `hh`, `m`, `mm`,
/// `s`, `ss`, `SSS`, `A`, `a`, `X`, `x`, and text in `[…]` as written.
/// Names in the interface language.
pub(crate) fn format(ms: i64, pattern: &str, lang: &str) -> String {
    let p = parts(ms);
    let pt = portuguese(lang);
    let month_name =
        if pt { MONTHS_PT } else { MONTHS_EN }[(p.month as usize).saturating_sub(1) % 12];
    let day_name = if pt { DAYS_PT } else { DAYS_EN }[p.weekday as usize % 7];
    let short = |s: &str| -> String { s.chars().take(3).collect() };
    let h12 = if p.hour.is_multiple_of(12) {
        12
    } else {
        p.hour % 12
    };
    let tokens: [&str; 27] = [
        "YYYY", "MMMM", "dddd", "MMM", "ddd", "SSS", "YY", "MM", "Do", "DD", "dd", "HH", "hh",
        "mm", "ss", "M", "D", "d", "H", "h", "m", "s", "A", "a", "X", "x", "Q",
    ];
    let chars: Vec<char> = pattern.chars().collect();
    let mut out = String::new();
    let mut i = 0;
    while i < chars.len() {
        if chars[i] == '['
            && let Some(close) = chars[i + 1..].iter().position(|&c| c == ']')
        {
            out.extend(&chars[i + 1..i + 1 + close]);
            i += close + 2;
            continue;
        }
        let rest: String = chars[i..].iter().take(4).collect();
        let Some(tok) = tokens.iter().find(|t| rest.starts_with(**t)) else {
            out.push(chars[i]);
            i += 1;
            continue;
        };
        let piece = match *tok {
            "YYYY" => format!("{:04}", p.year),
            "YY" => format!("{:02}", p.year.rem_euclid(100)),
            "MMMM" => month_name.to_owned(),
            "MMM" => short(month_name),
            "MM" => format!("{:02}", p.month),
            "M" => p.month.to_string(),
            "DD" => format!("{:02}", p.day),
            "D" => p.day.to_string(),
            "Do" => {
                if pt {
                    format!("{}º", p.day)
                } else {
                    let suffix = match (p.day % 10, p.day % 100) {
                        (1, n) if n != 11 => "st",
                        (2, n) if n != 12 => "nd",
                        (3, n) if n != 13 => "rd",
                        _ => "th",
                    };
                    format!("{}{suffix}", p.day)
                }
            }
            "dddd" => day_name.to_owned(),
            "ddd" => short(day_name),
            "dd" => day_name.chars().take(2).collect(),
            "d" => p.weekday.to_string(),
            "HH" => format!("{:02}", p.hour),
            "H" => p.hour.to_string(),
            "hh" => format!("{h12:02}"),
            "h" => h12.to_string(),
            "mm" => format!("{:02}", p.minute),
            "m" => p.minute.to_string(),
            "ss" => format!("{:02}", p.second),
            "s" => p.second.to_string(),
            "SSS" => format!("{:03}", p.millisecond),
            "A" => (if p.hour < 12 { "AM" } else { "PM" }).to_owned(),
            "a" => (if p.hour < 12 { "am" } else { "pm" }).to_owned(),
            "X" => ms.div_euclid(1_000).to_string(),
            "x" => ms.to_string(),
            "Q" => ((p.month - 1) / 3 + 1).to_string(),
            _ => String::new(),
        };
        out.push_str(&piece);
        i += tok.chars().count();
    }
    out
}

/// `ms` against `now`, as a person says it: "3 days ago", "in 2 hours";
/// "há 3 dias", "em 2 horas" in Portuguese. Moment's thresholds.
pub(crate) fn relative(ms: i64, now: i64, lang: &str) -> String {
    let pt = portuguese(lang);
    let diff = now - ms;
    let past = diff >= 0;
    let secs = diff.unsigned_abs() / 1_000;
    let (n, unit_en, unit_pt): (u64, (&str, &str), (&str, &str)) = if secs < 45 {
        (
            0,
            ("a few seconds", "a few seconds"),
            ("alguns segundos", "alguns segundos"),
        )
    } else if secs < 90 {
        (1, ("a minute", "minutes"), ("um minuto", "minutos"))
    } else if secs < 45 * 60 {
        (
            (secs + 30) / 60,
            ("a minute", "minutes"),
            ("um minuto", "minutos"),
        )
    } else if secs < 90 * 60 {
        (1, ("an hour", "hours"), ("uma hora", "horas"))
    } else if secs < 22 * 3_600 {
        (
            (secs + 1_800) / 3_600,
            ("an hour", "hours"),
            ("uma hora", "horas"),
        )
    } else if secs < 36 * 3_600 {
        (1, ("a day", "days"), ("um dia", "dias"))
    } else if secs < 26 * 86_400 {
        (
            (secs + 43_200) / 86_400,
            ("a day", "days"),
            ("um dia", "dias"),
        )
    } else if secs < 46 * 86_400 {
        (1, ("a month", "months"), ("um mês", "meses"))
    } else if secs < 320 * 86_400 {
        (
            (secs / 86_400 + 15) / 30,
            ("a month", "months"),
            ("um mês", "meses"),
        )
    } else if secs < 548 * 86_400 {
        (1, ("a year", "years"), ("um ano", "anos"))
    } else {
        (
            (secs / 86_400 + 182) / 365,
            ("a year", "years"),
            ("um ano", "anos"),
        )
    };
    let amount = match (n, pt) {
        (0, false) => unit_en.0.to_owned(),
        (0, true) => unit_pt.0.to_owned(),
        (1, false) => unit_en.0.to_owned(),
        (1, true) => unit_pt.0.to_owned(),
        (n, false) => format!("{n} {}", unit_en.1),
        (n, true) => format!("{n} {}", unit_pt.1),
    };
    match (past, pt) {
        (true, false) => format!("{amount} ago"),
        (false, false) => format!("in {amount}"),
        (true, true) => format!("há {amount}"),
        (false, true) => format!("em {amount}"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn civil_round_trip() {
        for days in [-800_000, -1, 0, 1, 19_000, 20_000, 2_932_896] {
            let (y, m, d) = civil_from_days(days);
            assert_eq!(days_from_civil(y, m, d), days);
        }
        assert_eq!(civil_from_days(0), (1970, 1, 1));
        assert_eq!(days_from_civil(2000, 3, 1), 11_017);
        assert_eq!(parts(from_parts(2024, 2, 29, 23, 59, 58, 7)).day, 29);
        assert_eq!(parts(0).weekday, 4);
    }

    #[test]
    fn dates_as_properties_write_them() {
        assert_eq!(
            parse_date("2020-08-21", 0),
            Some((from_parts(2020, 8, 21, 0, 0, 0, 0), false))
        );
        assert_eq!(
            parse_date("2020-08-21T10:30:00", -180),
            Some((from_parts(2020, 8, 21, 10, 30, 0, 0), true))
        );
        assert_eq!(
            parse_date("2020-08-21 10:30", 0),
            Some((from_parts(2020, 8, 21, 10, 30, 0, 0), true))
        );
        // A zone moves the time to the user's: 13:30Z is 10:30 at UTC−3.
        assert_eq!(
            parse_date("2020-08-21T13:30:00Z", -180),
            Some((from_parts(2020, 8, 21, 10, 30, 0, 0), true))
        );
        assert_eq!(
            parse_date("2020-08-21T10:30:00.5-03:00", -180),
            Some((from_parts(2020, 8, 21, 10, 30, 0, 500), true))
        );
        for bad in [
            "2020-02-30",
            "2020-13-01",
            "21-08-2020",
            "2020-08-21T25:00",
            "2020-08-21x",
            "hoje",
        ] {
            assert_eq!(parse_date(bad, 0), None, "{bad}");
        }
    }

    #[test]
    fn durations_and_calendar_months() {
        let d = parse_duration("1M").unwrap();
        let jan31 = from_parts(2025, 1, 31, 12, 0, 0, 0);
        assert_eq!(parts(add(jan31, d)).day, 28);
        assert_eq!(parse_duration("1 day").unwrap().ms, 86_400_000.0);
        assert_eq!(parse_duration("2h").unwrap().ms, 7_200_000.0);
        assert_eq!(parse_duration("3m").unwrap().ms, 180_000.0);
        assert_eq!(parse_duration("1y 2M").unwrap().months, 14.0);
        assert_eq!(parse_duration("-1w").unwrap().ms, -604_800_000.0);
        assert_eq!(parse_duration("1 fortnight"), None);
        assert_eq!(parse_duration(""), None);
        // "Bases syntax": date("2024-12-01") + "1M" + "4h" + "3m".
        let t = add(
            add(
                add(
                    from_parts(2024, 12, 1, 0, 0, 0, 0),
                    parse_duration("1M").unwrap(),
                ),
                parse_duration("4h").unwrap(),
            ),
            parse_duration("3m").unwrap(),
        );
        assert_eq!(t, from_parts(2025, 1, 1, 4, 3, 0, 0));
    }

    #[test]
    fn moment_formats() {
        let t = from_parts(2025, 5, 27, 9, 5, 3, 0);
        assert_eq!(
            format(t, "YYYY-MM-DD HH:mm:ss", "en"),
            "2025-05-27 09:05:03"
        );
        assert_eq!(
            format(t, "dddd, D [de] MMMM", "pt-BR"),
            "terça-feira, 27 de maio"
        );
        assert_eq!(
            format(t, "ddd MMM Do, h:mm A", "en"),
            "Tue May 27th, 9:05 AM"
        );
        assert_eq!(format(t, "[YYYY] YY", "en"), "YYYY 25");
    }

    #[test]
    fn relative_times() {
        let now = from_parts(2025, 5, 27, 12, 0, 0, 0);
        assert_eq!(relative(now - 3 * MS_PER_DAY, now, "en"), "3 days ago");
        assert_eq!(relative(now + 2 * MS_PER_HOUR, now, "pt-BR"), "em 2 horas");
        assert_eq!(relative(now - 10_000, now, "pt"), "há alguns segundos");
        assert_eq!(relative(now - 400 * MS_PER_DAY, now, "en"), "a year ago");
    }
}
