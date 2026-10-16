    use super::*;

    fn ip(s: &str) -> IpAddr {
        s.parse().unwrap()
    }

    fn ips(c: &[Candidate]) -> Vec<IpAddr> {
        c.iter().map(|c| c.ip).collect()
    }

    /// The maintainer's case: the system's resolver gave 10.0.0.1, another
    /// DNS server of the list the right address. The right one is tried
    /// after the wrong one, each once; the name stays out of it.
    #[test]
    fn the_other_servers_answers_follow_the_systems() {
        let others = vec![
            (ip("fd00::1"), vec![ip("10.0.0.1")]),
            (ip("192.168.0.2"), vec![ip("192.168.0.5"), ip("10.0.0.1")]),
        ];
        let got = order(None, &[], &[ip("10.0.0.1")], &others);
        assert_eq!(ips(&got), [ip("10.0.0.1"), ip("192.168.0.5")]);
        assert_eq!(got[0].via, Via::System);
        assert_eq!(got[1].via, Via::Server(ip("192.168.0.2")));
    }

    #[test]
    fn what_worked_goes_first_what_failed_last_and_nothing_unusable_is_tried() {
        let others = vec![(ip("192.168.0.2"), vec![ip("192.168.0.5"), ip("0.0.0.0")])];
        let sys = [ip("10.0.0.1")];
        let got = order(Some(ip("192.168.0.5")), &[], &sys, &others);
        assert_eq!(ips(&got), [ip("192.168.0.5"), ip("10.0.0.1")]);
        let got = order(None, &[ip("10.0.0.1")], &sys, &others);
        assert_eq!(ips(&got), [ip("192.168.0.5"), ip("10.0.0.1")]);
        assert!(order(None, &[], &[], &Vec::new()).is_empty());
    }

    /// The café: an address that worked at home is not among what the
    /// café's resolver returns, so it is not tried — a token never goes to
    /// an address no current resolver gave for the name.
    #[test]
    fn an_address_remembered_from_another_network_is_not_used() {
        let now = Instant::now();
        let nets: Nets = Vec::new();
        let k = Known {
            https: true,
            good: Some((ip("192.168.0.5"), now)),
            ..Known::default()
        };
        let got = plan(&k, Some(&[ip("203.0.113.9")]), &[], now);
        assert_eq!(ips(&got), [ip("203.0.113.9")]);
        // And when the café's resolver says the name does not exist, there
        // is nothing to send a token to.
        assert!(plan(&k, None, &nets, now).is_empty());
        // At home the remembered address is among the answers and goes first.
        let got = plan(&k, Some(&[ip("10.0.0.1"), ip("192.168.0.5")]), &[], now);
        assert_eq!(ips(&got), [ip("192.168.0.5"), ip("10.0.0.1")]);
    }

    /// Other resolvers' answers: for an https server, any (the certificate
    /// is checked for the name); for an http one, only private addresses,
    /// and none at all when the system said the name does not exist.
    #[test]
    fn other_resolvers_are_believed_only_as_far_as_the_scheme_allows() {
        let now = Instant::now();
        let nets: Nets = vec![(ip("192.168.0.9"), 24)];
        let others: Others = vec![(ip("9.9.9.9"), vec![ip("203.0.113.7"), ip("192.168.0.5")])];
        let mut k = Known {
            suspect: Some(now),
            others: Some((now, others)),
            ..Known::default()
        };
        // Plain http, the system answered wrongly: only the private one.
        let got = plan(&k, Some(&[ip("10.0.0.1")]), &nets, now);
        assert_eq!(ips(&got), [ip("10.0.0.1"), ip("192.168.0.5")]);
        // Plain http, the system said the name does not exist: nothing.
        assert!(plan(&k, None, &nets, now).is_empty());
        // https: both, and even when the system said no.
        k.https = true;
        let got = plan(&k, Some(&[ip("10.0.0.1")]), &nets, now);
        assert_eq!(
            ips(&got),
            [ip("10.0.0.1"), ip("203.0.113.7"), ip("192.168.0.5")]
        );
        assert_eq!(
            ips(&plan(&k, None, &nets, now)),
            [ip("203.0.113.7"), ip("192.168.0.5")]
        );
        // Not suspect: the other servers are not used at all.
        k.suspect = None;
        assert_eq!(
            ips(&plan(&k, Some(&[ip("10.0.0.1")]), &nets, now)),
            [ip("10.0.0.1")]
        );
    }

    /// On-link: inside the subnet of one of this machine's interfaces.
    /// A wide prefix (a VPN's /8 or /10) says nothing and is ignored;
    /// carrier-grade NAT's range is other customers; loopback is never
    /// another resolver's to give.
    #[test]
    fn only_an_address_on_a_network_this_machine_is_on_is_on_link() {
        let home: Nets = vec![(ip("192.168.0.9"), 24), (ip("fd00::9"), 64)];
        for yes in ["192.168.0.5", "192.168.0.254", "fd00::1"] {
            assert!(on_link(&ip(yes), &home), "{yes}");
        }
        for no in [
            "192.168.1.5",
            "10.0.0.1",
            "100.100.1.1",
            "203.0.113.7",
            "127.0.0.1",
            "::1",
            "fd01::1",
        ] {
            assert!(!on_link(&ip(no), &home), "{no}");
        }
        // The ISP's CGNAT is not ours, with or without an interface there:
        // a prefix as wide as /10 (a VPN's, Tailscale's on Windows) or /8 says
        // nothing about where a host is.
        assert!(!on_link(&ip("100.64.7.7"), &home));
        let wide: Nets = vec![
            (ip("192.168.0.9"), 24),
            (ip("100.101.102.103"), 10),
            (ip("10.8.0.2"), 8),
        ];
        assert!(!on_link(&ip("100.64.7.7"), &wide));
        assert!(!on_link(&ip("10.1.2.3"), &wide), "a /8 VPN is not the LAN");
        assert!(on_link(&ip("192.168.0.5"), &wide), "the LAN still is");
        assert!(
            !on_link(&ip("fd00::1"), &[(ip("fd00::9"), 16)]),
            "a /16 of IPv6 is too wide too"
        );
        // A loopback address is never believed from another resolver, even
        // if an interface were mis-listed with a loopback network.
        assert!(!on_link(&ip("127.0.0.1"), &[(ip("127.0.0.1"), 8)]));
        // A prefix of 0 would be everything: it is nothing.
        assert!(!on_link(&ip("8.8.8.8"), &[(ip("10.0.0.1"), 0)]));
        // And no network at all, no address.
        assert!(!on_link(&ip("192.168.0.5"), &[]));
    }

    /// A name used over plain http at all is the strict case, whatever else
    /// it was used for.
    #[test]
    fn a_name_ever_used_over_plain_http_is_treated_as_plain() {
        let host = "duplo.exemplo.test";
        declare(host, true);
        assert!(lock(&KNOWN).get(host).unwrap().tls());
        declare(host, false);
        assert!(!lock(&KNOWN).get(host).unwrap().tls());
        declare(host, true);
        assert!(
            !lock(&KNOWN).get(host).unwrap().tls(),
            "https later does not undo it"
        );
    }

    #[test]
    fn a_retry_is_worth_it_only_if_it_can_end_differently() {
        let tried = [ip("::1"), ip("127.0.0.1")];
        // A handshake failed at the first address: the other one first is new.
        assert!(worth_retrying(&tried, false, &[ip("127.0.0.1"), ip("::1")]));
        assert!(!worth_retrying(
            &tried,
            false,
            &[ip("::1"), ip("127.0.0.1")]
        ));
        // The TCP connection failed everywhere it was tried: only an address
        // that was not tried can change that — a dual-stack name whose
        // server is down is not tried twice.
        assert!(!worth_retrying(&tried, true, &[ip("127.0.0.1"), ip("::1")]));
        assert!(worth_retrying(
            &tried,
            true,
            &[ip("192.168.0.5"), ip("::1")]
        ));
        assert!(!worth_retrying(&tried, true, &[]));
    }

    #[test]
    fn linux_reads_the_real_upstreams_only_behind_the_stub() {
        let stub = "nameserver 127.0.0.53
options edns0
";
        let run = "nameserver 192.168.0.2
nameserver 10.8.0.1
";
        // Behind the stub: the upstreams (every link's, which is said).
        assert_eq!(
            linux_servers(stub, run),
            [ip("192.168.0.2"), ip("10.8.0.1")]
        );
        // A plain resolv.conf stands alone: the run file is not read into it.
        assert_eq!(
            linux_servers(
                "nameserver 192.168.5.5
",
                run
            ),
            [ip("192.168.5.5")]
        );
        // Behind the stub with no upstream file: the stub, as it is.
        assert_eq!(linux_servers(stub, ""), [ip("127.0.0.53")]);
    }

    /// Nothing but the system is asked while connections work; a failure
    /// makes the other servers wanted, once, and an empty answer (the
    /// network was down) is kept 15 seconds, not five minutes.
    #[test]
    fn the_other_servers_are_asked_only_after_a_failure() {
        let now = Instant::now();
        let mut k = Known::default();
        assert!(!k.wants_others(now), "nothing failed: nobody else is asked");
        k.suspect = Some(now);
        assert!(k.wants_others(now));
        k.asking = true;
        assert!(!k.wants_others(now), "being asked already");
        k.asking = false;
        k.others = Some((now, vec![(ip("192.168.0.2"), vec![ip("192.168.0.5")])]));
        assert!(!k.wants_others(now + Duration::from_secs(200)));
        assert!(k.wants_others(now + OTHERS_FOR + Duration::from_secs(1)));
        k.others = Some((now, vec![(ip("192.168.0.2"), Vec::new())]));
        assert!(!k.wants_others(now + Duration::from_secs(5)));
        assert!(k.wants_others(now + NO_OTHERS_FOR + Duration::from_secs(1)));
        // A suspicion that is old is none.
        assert!(!k.wants_others(now + SUSPECT_FOR + Duration::from_secs(1)));
    }

    #[test]
    fn a_failure_demotes_the_first_address_forgets_what_worked_and_names_what_was_tried() {
        let host = "falha.exemplo.invalid";
        worked(host, ip("192.168.0.5"));
        pretend_offered(
            host,
            order(
                None,
                &[],
                &[ip("10.0.0.1")],
                &vec![(ip("192.168.0.2"), vec![ip("192.168.0.7")])],
            ),
        );
        let tried = failed(host);
        assert_eq!(tried.len(), 2);
        {
            let all = lock(&KNOWN);
            let k = all.get(host).unwrap();
            assert_eq!(k.good, None);
            assert!(k.suspect.is_some());
            assert_eq!(k.demoted_at(Instant::now()), [ip("10.0.0.1")]);
        }
        assert_eq!(
            describe(host, &tried),
            "falha.exemplo.invalid → 10.0.0.1 (system), 192.168.0.7 (dns 192.168.0.2)"
        );
        // A name never resolved: nothing to say, but now suspect.
        assert!(failed("nunca.visto.invalid").is_empty());
        assert!(
            lock(&KNOWN)
                .get("nunca.visto.invalid")
                .unwrap()
                .suspect
                .is_some()
        );
        // The system's own answer working again ends the suspicion.
        lock(&KNOWN).get_mut(host).unwrap().last_system = vec![ip("10.0.0.1")];
        worked(host, ip("10.0.0.1"));
        assert!(lock(&KNOWN).get(host).unwrap().suspect.is_none());
        assert!(lock(&KNOWN).get(host).unwrap().demoted.is_empty());
    }

    #[test]
    fn a_query_is_the_name_in_labels() {
        let q = query(0xABCD, "universo.casa.exemplo.com", TYPE_A).unwrap();
        assert_eq!(&q[..4], [0xAB, 0xCD, 0x01, 0x00]);
        assert_eq!(&q[12..21], b"\x08universo");
        assert_eq!(&q[q.len() - 4..], [0, 1, 0, 1]);
        assert!(query(1, "", TYPE_A).is_none());
        assert!(query(1, &"a".repeat(64), TYPE_A).is_none());
        assert!(query(1, "a..b", TYPE_A).is_none());
    }

    /// A response as a server sends it: the question echoed, then `records`
    /// as (owner, type, rdata), each owner written out (or `None` for a
    /// pointer to the question's name).
    fn response(
        id: u16,
        rcode: u8,
        host: &str,
        qtype: u16,
        records: &[(Option<&str>, u16, Vec<u8>)],
    ) -> Vec<u8> {
        let mut b = query(id, host, qtype).unwrap();
        b[2] = 0x81;
        b[3] = 0x80 | rcode;
        b[7] = u8::try_from(records.len()).unwrap();
        for (owner, kind, rdata) in records {
            match owner {
                None => b.extend_from_slice(&[0xC0, 12]),
                Some(n) => {
                    for l in n.split('.') {
                        b.push(u8::try_from(l.len()).unwrap());
                        b.extend_from_slice(l.as_bytes());
                    }
                    b.push(0);
                }
            }
            b.extend_from_slice(&kind.to_be_bytes());
            b.extend_from_slice(&[0, 1, 0, 0, 0, 60]);
            b.extend_from_slice(&u16::try_from(rdata.len()).unwrap().to_be_bytes());
            b.extend_from_slice(rdata);
        }
        b
    }

    fn name_rdata(n: &str) -> Vec<u8> {
        let mut v = Vec::new();
        for l in n.split('.') {
            v.push(u8::try_from(l.len()).unwrap());
            v.extend_from_slice(l.as_bytes());
        }
        v.push(0);
        v
    }

    #[test]
    fn an_answer_is_read_and_a_wrong_one_is_not() {
        let a = |o: u8| vec![(None, TYPE_A, vec![192, 168, 0, o])];
        let r = response(7, 0, "a.b", TYPE_A, &a(5));
        assert_eq!(answers(&r, 7, "a.b", TYPE_A), [ip("192.168.0.5")]);
        assert_eq!(
            answers(&r, 7, "A.B.", TYPE_A),
            [ip("192.168.0.5")],
            "the name is not case-sensitive"
        );
        let mut v6 = vec![0_u8; 16];
        v6[0] = 0xfd;
        v6[15] = 1;
        let r6 = response(7, 0, "a.b", TYPE_AAAA, &[(None, TYPE_AAAA, v6)]);
        assert_eq!(answers(&r6, 7, "a.b", TYPE_AAAA), [ip("fd00::1")]);
        // Another query's id, a refusal (SERVFAIL), a query and not an
        // answer: nothing.
        assert!(answers(&r, 8, "a.b", TYPE_A).is_empty());
        assert!(answers(&response(7, 2, "a.b", TYPE_A, &a(5)), 7, "a.b", TYPE_A).is_empty());
        let mut asked = r.clone();
        asked[2] = 0x01;
        assert!(answers(&asked, 7, "a.b", TYPE_A).is_empty());
    }

    /// The question must be echoed, and a record counts only when its owner
    /// is the name asked or one reached by CNAME from it.
    #[test]
    fn only_records_that_answer_the_question_count() {
        let a5 = vec![192, 168, 0, 5];
        // A different name asked than answered.
        let r = response(7, 0, "outro.b", TYPE_A, &[(None, TYPE_A, a5.clone())]);
        assert!(answers(&r, 7, "a.b", TYPE_A).is_empty());
        // A different type asked than answered.
        let r = response(7, 0, "a.b", TYPE_AAAA, &[(None, TYPE_A, a5.clone())]);
        assert!(answers(&r, 7, "a.b", TYPE_A).is_empty());
        // A record owned by another name, beside the right one.
        let r = response(
            7,
            0,
            "a.b",
            TYPE_A,
            &[
                (Some("evil.example"), TYPE_A, vec![6, 6, 6, 6]),
                (None, TYPE_A, a5.clone()),
            ],
        );
        assert_eq!(answers(&r, 7, "a.b", TYPE_A), [ip("192.168.0.5")]);
        // A CNAME chain, then the address under the last name.
        let r = response(
            7,
            0,
            "a.b",
            TYPE_A,
            &[
                (None, TYPE_CNAME, name_rdata("x.y")),
                (Some("x.y"), TYPE_CNAME, name_rdata("z.y")),
                (Some("z.y"), TYPE_A, a5.clone()),
            ],
        );
        assert_eq!(answers(&r, 7, "a.b", TYPE_A), [ip("192.168.0.5")]);
        // An address under a name nothing pointed to: not ours.
        let r = response(7, 0, "a.b", TYPE_A, &[(Some("z.y"), TYPE_A, a5)]);
        assert!(answers(&r, 7, "a.b", TYPE_A).is_empty());
    }

    /// Whatever bytes arrive, nothing panics and nothing runs on.
    #[test]
    fn a_hostile_answer_is_bounded() {
        let r = response(7, 0, "a.b", TYPE_A, &[(None, TYPE_A, vec![1, 2, 3, 4])]);
        for cut in 0..r.len() {
            let _ = answers(&r[..cut], 7, "a.b", TYPE_A);
        }
        let mut loopy = r.clone();
        loopy[12] = 0xC0;
        loopy[13] = 12;
        let _ = answers(&loopy, 7, "a.b", TYPE_A);
        let mut many = r;
        many[6] = 0xFF;
        many[7] = 0xFF;
        let _ = answers(&many, 7, "a.b", TYPE_A);
        for seed in 0_u8..=255 {
            let junk: Vec<u8> = (0..64_u8)
                .map(|i| i.wrapping_mul(seed).wrapping_add(seed))
                .collect();
            let _ = answers(&junk, 7, "a.b", TYPE_A);
        }
    }

    /// A DNS server on this machine answers; the query goes to it by UDP.
    #[test]
    fn a_dns_server_is_asked_by_udp() {
        let server = UdpSocket::bind("127.0.0.1:0").unwrap();
        let addr = server.local_addr().unwrap();
        let thread = std::thread::spawn(move || {
            let mut buf = [0_u8; 512];
            for _ in 0..2 {
                let (n, from) = server.recv_from(&mut buf).unwrap();
                let id = u16::from_be_bytes([buf[0], buf[1]]);
                let kind = u16::from_be_bytes([buf[n - 4], buf[n - 3]]);
                let reply = if kind == TYPE_A {
                    response(
                        id,
                        0,
                        "a.b",
                        TYPE_A,
                        &[(None, TYPE_A, vec![192, 168, 0, 5])],
                    )
                } else {
                    // No AAAA: an answer with no records.
                    response(id, 0, "a.b", kind, &[])
                };
                server.send_to(&reply, from).unwrap();
            }
        });
        let got = ask(addr, "a.b", Duration::from_secs(3));
        thread.join().unwrap();
        assert_eq!(got, [ip("192.168.0.5")]);
        // Nobody listening: nothing, within the time given.
        let dead = UdpSocket::bind("127.0.0.1:0").unwrap();
        let t = Instant::now();
        assert!(
            ask(
                dead.local_addr().unwrap(),
                "a.b",
                Duration::from_millis(200)
            )
            .is_empty()
        );
        assert!(t.elapsed() < Duration::from_secs(2));
    }

    #[test]
    fn the_lists_of_servers_are_read_as_each_system_writes_them() {
        let conf = "# generated\nnameserver 192.168.0.2\nnameserver fd00::1 # router\nnameserver fe80::1%en0\nsearch lan\n";
        assert_eq!(from_resolv_conf(conf), [ip("192.168.0.2"), ip("fd00::1")]);
        assert_eq!(
            from_lines("192.168.0.2\r\n\r\nfd00::1\n"),
            [ip("192.168.0.2"), ip("fd00::1")]
        );
        assert_eq!(
            tidy(vec![
                ip("1.1.1.1"),
                ip("0.0.0.0"),
                ip("1.1.1.1"),
                ip("fec0:0:0:ffff::1"),
                ip("fec0:0:0:ffff::3"),
                ip("fec0:0:0:ffff::4"),
            ]),
            [ip("1.1.1.1"), ip("fec0:0:0:ffff::4")]
        );
    }

    /// macOS: the global resolver's servers only — not the one for `local`,
    /// not a supplemental one, not the part for scoped queries.
    #[test]
    fn scutil_gives_the_global_servers_only() {
        let scutil = "DNS configuration\n\nresolver #1\n  search domain[0] : lan\n  nameserver[0] : fd00::1\n  nameserver[1] : 192.168.0.2\n  nameserver[2] : 100.100.100.100\n  if_index : 15 (en0)\n  flags    : Request A records\n\nresolver #2\n  domain   : local\n  options  : mdns\n  timeout  : 5\n  flags    : Request A records\n  order    : 300000\n\nresolver #3\n  domain   : corp.example\n  nameserver[0] : 10.9.9.9\n  flags    : Supplemental, Request A records\n\nresolver #4\n  nameserver[0] : 10.8.8.8\n  flags    : Supplemental, Request A records\n\nDNS configuration (for scoped queries)\n\nresolver #1\n  nameserver[0] : 192.168.5.5\n  if_index : 15 (en0)\n  flags    : Scoped, Request A records\n";
        assert_eq!(
            from_scutil(scutil),
            [ip("fd00::1"), ip("192.168.0.2"), ip("100.100.100.100")]
        );
    }

    /// A name `.local` or `localhost` is the system's alone.
    #[test]
    fn local_names_are_left_to_the_system() {
        assert!(local_name("localhost"));
        assert!(local_name("zima.local"));
        assert!(!local_name("universo.casa.exemplo.com"));
    }

    /// A name the system resolves, an address that worked before and is
    /// among the system's answers: the request goes there, still addressed
    /// to the name (the `Host` header is the name's).
    #[test]
    fn a_remembered_address_among_the_answers_is_used_and_the_name_is_kept() {
        use std::io::{Read, Write};
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        let host = "lembrado.exemplo.test";
        pretend_system(host, vec![ip("192.0.2.1"), ip("127.0.0.1")]);
        worked(host, ip("127.0.0.1"));
        let server = std::thread::spawn(move || {
            let (mut c, _) = listener.accept().unwrap();
            let mut seen = [0_u8; 1024];
            let n = c.read(&mut seen).unwrap();
            c.write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\nok")
                .unwrap();
            String::from_utf8_lossy(&seen[..n]).into_owned()
        });
        let client = crate::remote::http().unwrap();
        let response = client
            .get(format!("http://{host}:{port}/"))
            .send_retrying()
            .unwrap();
        assert_eq!(
            response.remote_addr().map(|a| a.ip()),
            Some(ip("127.0.0.1"))
        );
        assert_eq!(response.text().unwrap(), "ok");
        let request = server.join().unwrap().to_ascii_lowercase();
        assert!(
            request.contains(&format!("host: {host}:{port}")),
            "{request}"
        );
    }

    /// A connect failure is retried once and leaves the name suspect, its
    /// first address last.
    #[test]
    fn a_failed_connection_marks_the_name_and_is_tried_once_more() {
        let port = std::net::TcpListener::bind("127.0.0.1:0")
            .unwrap()
            .local_addr()
            .unwrap()
            .port();
        let host = "fechado.exemplo.test";
        pretend_system(host, vec![ip("127.0.0.1")]);
        let client = crate::remote::http().unwrap();
        let e = client
            .get(format!("http://{host}:{port}/"))
            .send_retrying()
            .unwrap_err();
        assert!(e.is_connect());
        assert!(
            tcp_level(&e),
            "a refused connection is a failure of the TCP connection"
        );
        let all = lock(&KNOWN);
        let k = all.get(host).unwrap();
        assert!(k.suspect_at(Instant::now()));
        assert!(!k.tls());
        assert_eq!(k.demoted_at(Instant::now()), [ip("127.0.0.1")]);
    }

    /// An address that accepts the TCP connection and cannot complete the
    /// handshake (a router's page on the port) does not block the next:
    /// the handshake is made per address, the failed one goes last, and the
    /// one where it succeeds is remembered.
    #[test]
    fn a_dial_passes_over_an_address_whose_handshake_fails() {
        tauri::async_runtime::block_on(a_dial_passes_over());
    }

    async fn a_dial_passes_over() {
        // ::1 and 127.0.0.1 on one port, the two loopbacks every machine has;
        // a machine without ::1 fails here, loudly, rather than pass.
        let v6 = std::net::TcpListener::bind("[::1]:0").unwrap();
        let port = v6.local_addr().unwrap().port();
        let v4 = std::net::TcpListener::bind(("127.0.0.1", port)).unwrap();
        let _keep = (v6, v4);
        let host = "dois.exemplo.test";
        pretend_system(host, vec![ip("::1"), ip("127.0.0.1")]);
        let got = dial_with(host, port, |stream| async move {
            if stream.peer_addr().unwrap().is_ipv6() {
                Err(("not a Verso", false))
            } else {
                Ok("v4")
            }
        })
        .await;
        assert!(matches!(got, Ok("v4")));
        {
            let all = lock(&KNOWN);
            let k = all.get(host).unwrap();
            assert_eq!(k.good.map(|g| g.0), Some(ip("127.0.0.1")));
            assert_eq!(k.demoted_at(Instant::now()), [ip("::1")]);
        }
        // The server's own refusal ends the dial, with that address kept.
        let again = dial_with(
            host,
            port,
            |_stream| async move { Err::<(), _>(("401", true)) },
        )
        .await;
        assert!(matches!(again, Err(Dial::Shake("401"))));
        // Every address failing: the last failure is the error.
        let none = dial_with(host, port, |_s| async move { Err::<(), _>(("no", false)) }).await;
        assert!(matches!(none, Err(Dial::Shake("no"))));
    }

    /// The dial as a whole has a ceiling: an address that accepts and never
    /// finishes the handshake costs its own time, not the time of all.
    #[test]
    fn a_dial_has_a_ceiling() {
        tauri::async_runtime::block_on(async {
            let l = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
            let port = l.local_addr().unwrap().port();
            let host = "teto.exemplo.test";
            pretend_system(host, vec![ip("127.0.0.1")]);
            let t = Instant::now();
            let got = dial_with(host, port, |_s| async move {
                tokio::time::sleep(Duration::from_secs(60)).await;
                Ok::<(), (&str, bool)>(())
            })
            .await;
            assert!(
                matches!(got, Err(Dial::Io(ref e)) if e.kind() == io::ErrorKind::TimedOut),
                "{got:?}"
            );
            assert!(
                t.elapsed() < SHAKE_FOR,
                "{:?}: the ceiling, not the handshake's own time",
                t.elapsed()
            );
            drop(l);
        });
    }
