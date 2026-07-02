# Steeple
### Product Brief

*An overview of what Steeple is, why it exists, who it serves, and how it sustains itself. A separate technical specification (the PRD) covers the build.*

---

Steeple is a local marketplace for community space. Churches across a neighborhood open their spare halls, rooms, and kitchens — usually for free — to the playgroups, tutoring classes, clubs, and small non-profits nearby that need an affordable place to meet. It replaces the door-knocking and cold-calling that finding community space still depends on: an organizer searches a map of what's nearby, sees real photos and details, and sends the church a request; the church sees who's asking and what for, and says yes, asks a question, or declines.

## How it works

Steeple is a few connected pieces, used by three kinds of people:

```
   ORGANIZER ("Maria")      VENUE PROVIDER (e.g. a church)
   browse · apply · hire    list · approve · manage venues
            │                              │
            ├──────────────────────────────┤   either side → either surface
            │                              │
            ▼                              ▼
   ┌─────────────────┐            ┌─────────────────┐
   │     WEBSITE     │            │   MOBILE APP    │
   │  (no download)  │            │ (iOS + Android) │
   └─────────────────┘            └─────────────────┘

                         ┌───────────────────┐
   OPERATOR (founder) ──▶│  ADMIN DASHBOARD  │  manage venues & bookings, moderate
                         └───────────────────┘
```

*Website and mobile app are two equal front doors — an organizer or a venue provider can use either. The MVP goal is self-service: venue providers list and manage their own venues, and organizers find and hire them directly. Early on the operator seeds venues by hand so the map is never empty; the admin dashboard is for management and moderation.*

**A booking, start to finish** — the common case, a free recurring slot:

1. Maria, who runs a weekly toddler playgroup, browses nearby halls on the **website** — no sign-up, no download.
2. She filters to what she needs — Tuesday mornings, ~15 people, toddler-friendly, free or low-cost — and a few church halls appear within range.
3. She opens one: photos, capacity, what's included, the house rules.
4. She **opens the app to apply**, describes her group and that it repeats weekly, and signs in with Google or Apple (one tap — her first and only friction).
5. The **church is notified**, sees who's asking and why, and **approves**.
6. The booking is confirmed for the term; both sides are notified.
7. The playgroup meets, week after week. Maria can leave a rating that builds her standing for next time.

## Why it exists

The idea came out of a real, frustrating gap. In 2017, scouting a site for a school's next campus, Steeple's founder ended up driving door to door to churches, working out by hand whether any building might suit. It was slow and manual — and along the way she noticed the other half of the problem: church after church asked her to *spread the word* about space they had going spare. Both sides were looking for each other, and there was no way for them to meet. That gap is still there.

**Churches have space, and want their community to use it.** A typical church hall — kitchen, restrooms, a big open floor — sits empty most of the week; church buildings are in use only about 15% of the time.¹ That's a substantial, welcoming space going unused six days out of seven, and most congregations would genuinely like to see it full of local life. (Churches are under real pressure too — more U.S. Protestant churches now close than open each year² — and a building woven into its neighborhood's week is a church more connected to the community it exists to serve.) What they lack is a way to be found.

**Community organizers have the exact opposite problem.** Schools, non-profits, playgroups, hobby clubs, and faith groups need somewhere affordable and close to meet, and can't easily find it. Virginia alone has roughly 47,000 registered non-profits, and the five Northern Virginia jurisdictions about 480 public schools,³ on top of countless smaller groups. Affordable meeting space is a well-documented shortage — community foundations run programs specifically to help non-profits track down low-cost rooms.⁴ The realistic options today are the founder's 2017 experience (ask around, cold-call, hope) or commercial event-venue sites priced for weddings and corporate offsites, not a Tuesday-morning toddler group.

Steeple closes that gap: it lets a church open its doors to the neighborhood, and a local group find a home, without either having to go door-knocking.

## What makes it different

Other platforms already help churches rent out space, but they're built around a different idea. The closest is **ChurchSpace**, often called "the Airbnb for churches": funded (~$1.48M raised), with churches reported to earn $23,000–$100,000 a year.⁵ Its pitch is *passive income* — food entrepreneurs, small businesses, "turning churches into economic engines" — and it's focused on Texas and Detroit, not Northern Virginia.

Steeple is deliberately the opposite. It isn't about helping a church squeeze income out of its building; it's about helping a church do what it already wants to do — open its space to its community — starting at free. Free isn't a discount or a gimmick here; it's the whole point. It's what most churches most want to offer and what a stretched playgroup most needs. Put simply: **everyone else helps churches make *money* from their space; Steeple helps them make a *difference* with it.**

It's also strictly local. Unlike booking a holiday rental, both the organizer and the families who'll show up are tied to a place, so what matters is the right space within reach — not the best space across the city.

The wider venue-rental world — Peerspace, Tagvenue, and the like, with tens of thousands of listings between them⁶ — is large and growing, but built for commercial events at commercial prices. It doesn't serve, and isn't trying to serve, the Tuesday-morning playgroup. No one is.

## The moat, and where value is captured

Between each side and the marketplace sits a layer of trust and risk — the **"gates"** — that Steeple owns, and it's central to the product. A church is letting strangers into a valued, sometimes sacred space, often one used by children; an organizer is trusting that a space is real and that the arrangement will hold. Closing that gap is the hard, valuable work: verified sign-in, a written account of who you are and what you're running, ratings and booking history, and — over time — contracts, insurance, and damage cover.

The gates are both what makes the marketplace safe enough to use **and where Steeple captures value.** People will pay for trust when the stakes are personal and a stranger is involved — paid "verified" badges for providers and organizers now, insurance and damage cover later. Free bookings stay the draw; trust is the part worth charging for.

It's worth being honest about what actually *defends* that position, because two tempting answers don't:

- **Low cost isn't a moat.** Running lean is a genuine survival advantage — it buys time and lets Steeple serve the free, low-value bookings a well-funded rival won't bother with — but anyone can run cheaply, including a large incumbent that launches a subsidized "community tier."
- **Trust features aren't a moat on their own.** Verified badges and vetting are valuable and worth paying for, but a funded competitor could copy them.

**The real moat is local — narrow, but genuine:** a dense cluster of real, vetted venues in one neighborhood, the community's trust, and the founder's existing Northern Virginia church-and-school relationships. None of that can be bought or copied quickly, which makes Steeple defensible in *one* metro. The same fact cuts both ways — every new metro has to be earned the same slow way — so the strategy is to go deep in one place before going wide.

## How it pays for itself

Steeple is built to run cheaply and serve its mission, not to chase fast growth — and that shapes the money.

**It costs very little to run.** Early on the whole service runs on roughly $20–$30 a month: a small server, photo storage, a domain, and the Apple developer membership⁷ — well under the ~$100/month ceiling the project sets itself. That low cost is the real advantage: it lets Steeple give space away for free and still sustain itself, which a company spending investors' money cannot.

**Most bookings are free, and stay free.** Revenue, when it comes, stays small and sits *on top* of that free core: a thin, invisible fee folded into the *paid* bookings (free ones are never touched), plus the paid trust layer described above — "verified" badges now, insurance and damage cover later. Money moving through Steeple is only one sign it's working; the real one is community activity happening that wouldn't have otherwise.

**The opportunity is real even locally.** Fairfax County alone has over 550 churches;⁸ across Northern Virginia, well over a thousand — against tens of thousands of non-profits and hundreds of schools that need space. Where bookings are paid, community halls commonly go for $25–$75 an hour,⁹ so even a thin fee on the paid minority adds up as the network grows.

## Where it's going

- **In a few months:** a real, working map of space in one Northern Virginia neighborhood, with the first churches listed and the first playgroups, classes, and clubs actually meeting.
- **In a year:** an active local network where word is spreading on its own, dozens of recurring community activities running, and the platform comfortably covering its own small costs.
- **Longer term:** the same thing, neighborhood by neighborhood — knowing each new area has to be *earned* with real local relationships, the way the first one will be.

**The one thing still to crack is getting the word out to organizers.** Signing up churches is the part the founder already knows how to do — she's been doing versions of it since 2017. The harder question is how someone like Maria first hears that Steeple exists. The likely answer is the founder's own network of schools and non-profits, plus the churches themselves telling their congregations — but this is the piece to work out together, because the best map in the world is useless if no one knows to look at it. Everything else — trust and safety, the technology, the costs, the design — has solid answers; this is the open item to resolve with the founder.

---

## Sources & notes

*Figures below are real and sourced. Where solid Northern-Virginia-specific data doesn't exist publicly, the best national or comparable figure is used and flagged.*

1. Church buildings used ~15% of the week — Sunergo (church-services industry source; directional). https://news.sunergo.net/blog/78/Good-Stewardship-of-an-Underutilized-Asset
2. ~4,000 U.S. Protestant church closures vs. ~3,800 openings in 2024 — Lifeway Research (Jan 2026). https://news.lifeway.com/2026/01/13/lifeway-research-finds-church-closures-eclipse-openings-in-the-u-s/
3. ~47,000 registered 501(c)(3) non-profits in Virginia (ProPublica Nonprofit Explorer); ~480 public schools across the five NoVA jurisdictions (Ballotpedia / district sources). https://projects.propublica.org/nonprofits/states/VA · https://ballotpedia.org/Fairfax_County_Public_Schools,_Virginia
4. Affordable community/meeting space is a recognized scarcity — community-foundation meeting-space programs (qualitative, national). https://coloradononprofits.org/faqs/where-can-i-find-affordable-meeting-space-for-my-nonprofit/
5. ChurchSpace: ~$1.48M raised (latest round $1.2M); pilot churches earned ~$23K–$38K in year one, top performers up to ~$100K/yr — UrbanGeekz, AfroTech. https://urbangeekz.com/2025/05/churchspace-1-2m-airbnb-for-churches/
6. Peerspace (~40,000 spaces) and Tagvenue (~20,000 venues) for scale; event-booking-software market ~$3.5B in 2024 (illustrative — analyst estimate). https://www.tagvenue.com/blog/top-venue-booking-platforms-for-unique-event-spaces/
7. Lean operating cost ~$20–$30/month — DigitalOcean server (~$6–12) + storage (~$5) + domain (~$1) + Apple Developer ($99/yr ≈ $8/mo) + transactional email (free tier). Vendor pricing pages. https://www.digitalocean.com/pricing/droplets
8. 552 congregations in Fairfax County, VA — Association of Religion Data Archives, 2020 U.S. Religion Census. https://www.thearda.com/us-religion/census/congregational-membership?y=2020&t=0&c=51059
9. Church-hall rental rates — community/small-room band ~$25–$75/hr, broader industry range $50–$300/hr (illustrative; published per-hour NoVA rates are not public, most churches quote on request). https://www.studiosupply.com/blog/rent-a-church---church-rental-costs
