---
title: A Table over the Internet
date: 2026-11-04
tags:
  - verso
  - server
  - table
  - cloudflare
  - guide
status: active
---

# A Table over the Internet

Do you want to play with people who are not at your home, without renting a server or knowing about networks? Verso on your computer can **turn into a server** for a few hours: you turn it on, send the players a **link**, they come in through the browser and play at the [[31 - The Table|Table]], as on a UniVerso ([[23 - Verso on a Server]]). It is the same idea as running Foundry on your computer: **the computer has to stay on and awake** while the table runs.

It is **one feature**, **Turn into a server**, with two boxes: serving **on your network** (the phones you [[22 - Verso on Phone and Tablet|pair]]) and serving **by an internet link**. Tick one, the other, or both.

> [!WARNING] The link is a testing mode
> The link uses a Cloudflare testing service: no guarantee it works, up to 200 requests at once. Verso says so in the box itself. Only people you invite get in, and nobody sees a folder you did not share. **Turn it off when the session ends.**

---

## 1. Turn the link on

1. Open the campaign's folder in Verso and go to **Settings › Turn into a server**.
2. Under **Folders served**, tick the campaign's folder. None comes ticked. For a table, serve the **whole folder**: it is the one you will invite people to and sit at.
3. Under **Where to serve**, tick **By an internet link (Cloudflare, testing mode)**. If you do not want to serve phones on your network, leave **On my network** unticked: with the link alone, the computer accepts nothing from your home network.
4. Tap **Turn the server on**. **The first time**, Verso downloads **cloudflared**, Cloudflare's program that opens the link (about 40 MB), and checks its sum before using it. It takes a moment; the panel says what is happening.
5. When **Link on.** shows, the panel gives the **Table address**, with **Copy link** and **Show the link's QR**. The status bar now says **Serving · internet link**, and the book icon in the Mac's menu bar (or Windows' notification area) gains a line **Internet link on**; on Linux there is only the status bar's mark.

The panel also says:

- **Time left**: *Closes by itself in … h … min*. The link lasts **12 hours**. **Extend by 12 hours** keeps the **same link** for 12 more. Past the 12 hours without extending, the link closes and the panel says so; turn it on again for a new link.
- **A quick link changes each time it turns on.** Send the new one to the people; invitations made before point to the old link.
- If the network blocks UDP: *the link now uses HTTP/2*. It works the same, sometimes a little slower.
- **cloudflared** is Cloudflare's, Apache-2.0 licence; the list is in **Settings › Credits**.

### If it does not turn on

The panel gives the reason in words. The usual ones:

- *Could not download cloudflared from GitHub*: no internet, or GitHub did not answer. Check the connection and try again.
- *The downloaded cloudflared does not match the sum Verso pins*: the file was refused and deleted. Try again later.
- *cloudflared reached no Cloudflare server*: the network seems to block it. Try another network.
- *Cloudflare gave no link in time*: the testing service may be down. Try again in a moment.

---

## 2. Invite the players

Under **Invite people**:

1. Under **Folder**, choose the served folder (or **None (the account only)**), and under **Can**, **Read** or **Edit**.
2. **Make an invitation**. The link shows **only once**: **Copy invitation** and send it to the person however you like. It is good for **7 days** and for **one person only**.
3. The player opens the link, makes the account with **any e-mail of theirs** (**nothing is sent**: the e-mail is only a sign-in name), a name and a password, and then signs in at the table address.
4. The **Invitations** list shows each one (waiting, accepted by…, ended, expired) and **End** closes one still waiting.

If the invitation goes out with your **network's** address (the link box unticked), the panel warns: only someone on it can open it, and the browser will complain about the computer's certificate — the same warning as [[22 - Verso on Phone and Tablet#Pair the Phone with Your Computer|pairing a phone]]; accept it only on a network you trust.

Whoever comes in sees only what you shared, with the role you gave. How to run the table (releasing notes, players, rights) is in [[32 - Running a Table]].

**For whoever was invited:** the sign-in page reminds you to open the invitation's link **first** and make the account. If the table does not answer, the window says **The table is offline** — the game master's computer may have been turned off or gone to sleep, or the link ended — with **Try again**, and tries by itself every 30 seconds. If the game master sent a new link, just open it.

---

## 3. Sit at the table

Serving does not open the table in **your** window. To run it, go to **This window at the table** and use **Sit at the table** on the window's folder (it has to be served whole). The window becomes a client of your own server, as the owner: it has the Table, the campaign and the invitations, as on a UniVerso. The status bar shows **At the table**.

**Leave the table** (in the section, or on the status bar's mark) goes back to this computer's folder. If the server **stops** with the window seated, it goes back to the computer's folder by itself and says so. Next time, Verso opens the computer's folder, never the table.

### Read links

Under **Read links**, **Turn read links on** starts **off**. On, you make a link in a note's or a folder's menu **in the window sitting at the table**, and whoever has it reads, with no account and without editing. Turning it off **closes every link at once**; on again reopens the ones you did not revoke. A link never opens a folder served only in part.

---

## 4. Your own address, which does not change

The quick link changes every time. If you have your own **domain**, you can have a fixed address, like `table.yourdomain.com`, and **without the 12-hour limit**. You need a **Cloudflare** account with the domain added to it (the free plan will do). Under **Use my own address**:

1. **Own a domain and add it to Cloudflare** — once, by hand. **How to add a domain to Cloudflare** leads to their page.
2. **Sign in to Cloudflare**: the browser opens, you sign in and pick the domain. Verso waits up to 10 minutes. If the browser does not open, the panel shows the page to open by hand.
3. Type the **Address** (`table.yourdomain.com`: lowercase letters, numbers and hyphens, with a dot) and tap **Set up**. Verso makes the tunnel and the DNS record; it can take a few minutes to open everywhere.

Then tick **Use my address for the link (instead of a quick link)** with the link off. The same address works in every session.

- **Remove my address** deletes the tunnel at Cloudflare (the DNS record may stay there; delete it in the dashboard if you like). If Cloudflare cannot be asked, **Forget on this computer only** clears it here, and the tunnel stays there until you delete it.
- With **Keep on when the app starts**, your own address comes back when the app opens; the quick link never does.

---

## 5. Accounts, passwords and other apps

- **Password or passkey:** on your **network**, people sign in with the **password**. A **passkey** only works through the internet link. A passkey made on a **quick link goes away with it**; on **your own address**, it stays.
- **Other people's Verso apps:** someone you invited can connect their own Verso (**Settings › Servers**) and sync the folder shared with them. Use the **link's address**: on the network, their Verso does not trust your computer's certificate and does not connect. The list shows each app with its name and the person, and **End** disconnects it. **Phones never sync**: they use the browser's window.
- **Tokens:** whoever has an account can make, in the browser, a personal token for a program of theirs; it reaches only that account's folders, and never opens anything of the computer's owner.
- **Your own phone:** pairing by QR is **on the network only**. With the link alone, **Pair a phone** is off and says why.

---

## 6. Stop

**Stop serving** (in the section, the status bar or the icon's menu) turns everything off at once: the link, the network and the seated window. Closing the app does the same. If the computer sleeps, the table drops: the players see **The table is offline**.

---

If you would rather have a server that stays on by itself, go back to [[38 - Installing the server on a NAS or a VPS]]. Or go to the [[00 - Welcome to Verso|Home Page]] or open the [[Verso Tour.canvas|Verso Tour]].
