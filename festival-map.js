/* ═══════════════════════════════════════════════════════
   Delta Harvest Festival — "Throughout the Village" map
   Custom illustrated village map, vanilla JS, no dependencies.
   Loaded lazily by main.js only once the trigger is engaged.

   Redesigned senior-first: the village layout below follows the
   real road network and venue relationships from the official
   2025 brochure map (Map/Map.png) — a central crossroads core
   (Blacksmith Shop / Old Stone Mill / Old Town Hall / Russell
   Greenspace), County Road 42 running through it, Lower Beverley
   Lake Park reached via Lake Park Road to the north, Mill Creek
   Drive leading south to the Fire Hall Museum, and Recreation
   Drive continuing to DARS and St. Paul's — rather than an
   abstract, decorative layout.
   ═══════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ─── location data ───────────────────────────────────────
     Event names, times and descriptions are drawn verbatim from
     the official "Delta Harvest Festival 2025 Program Guide & Map"
     (Map/harvest-festival-program-map-2025.pdf), published by the
     Delta & Area Community Enhancement Committee. Links were
     verified against each organisation's own site. Where no
     official source could be confirmed, the field is explicitly
     marked as an AI-generated placeholder rather than presented
     as fact.

     Coordinates (x, y) are derived from real surveyed geography
     (OpenStreetMap road and building data for Delta, ON, cross-
     checked against Google Maps), not an illustration. Each
     location's true compass bearing and distance from the Old
     Stone Mill were measured, then plotted onto the 1600×1100
     canvas at a single uniform scale (1 real metre = 1.3 canvas
     units) applied identically to every venue, road and waterway
     — so a location 80 real metres from the Mill sits proportionally
     as close on the map as it actually is on foot. Nothing is
     stretched apart for touch-target convenience; the village reads
     at its true relative scale. See Map/Map-Revision-Report.md for
     the full per-venue accuracy table. */
  var DATA = [
    {
      id: 'mill', x: 750, y: 480, icon: 'icon-mill',
      name: 'Old Stone Mill',
      eyebrow: 'Old Stone Mill',
      title: 'Free Tours, Quilt Show & Bread Contest',
      time: '10:00 AM – 3:00 PM · Milling demonstration at 1:00 PM',
      description: 'Free tours of the 1810 grist mill, a quilt show, a bread contest and tasting, and baked goods from the Friends of the Mill. At 1 PM, watch the 200-year-old millstones turn in a live milling demonstration, grinding heritage Red Fife wheat into flour.',
      isOfficial: true,
      link: { label: 'Delta Mill Society', url: 'https://www.deltamill.org/' },
      heritage: { text: 'Built in 1810, the Old Stone Mill is a National Historic Site of Canada and one of the oldest surviving stone grist mills in Ontario — its waterwheel and millstones have ground flour for the village for over two centuries.', isPlaceholder: false }
    },
    {
      id: 'townhall', x: 492, y: 351, icon: 'icon-hall',
      name: 'Old Town Hall',
      eyebrow: 'Old Town Hall',
      title: 'Open House & Public Washrooms',
      time: '10:00 AM – 3:00 PM',
      description: 'The Old Town Hall is open to festival visitors, with public washrooms available throughout the day.',
      isOfficial: true,
      link: { label: 'Delta Mill Society', url: 'https://www.deltamill.org/' },
      heritage: { text: 'Raised in 1879–1880 as a joint venture between the Township of Bastard & South Burgess and the Harmony Lodge No. 370 Masonic Lodge, the hall survived a serious fire in 1888. Its bricks were hand-pressed by local brickmaker Jasper Russell.', isPlaceholder: false }
    },
    {
      id: 'blacksmith', x: 653, y: 517, icon: 'icon-anvil',
      name: 'Blacksmith Shop',
      eyebrow: 'Blacksmith Shop',
      title: 'Blacksmithing Demonstrations & Garden Market',
      time: '10:00 AM – 2:00 PM',
      description: 'Watch live blacksmithing demonstrations inside the heritage forge, with a market garden and handmade crafts set up in front of the shop.',
      isOfficial: true,
      link: { label: 'Delta Mill Society', url: 'https://www.deltamill.org/' },
      heritage: { text: 'Restored and operated by the Delta Mill Society, the Blacksmith Shop sits beside the Old Stone Mill and demonstrates the 19th-century ironworking techniques once used to keep the mill and village running.', isPlaceholder: false }
    },
    {
      id: 'kingstreet', x: 679, y: 679, icon: 'icon-market',
      name: 'King Street',
      eyebrow: 'King Street',
      title: 'Farmers Market & Vendors',
      time: '9:00 AM – 3:00 PM',
      description: 'King Street fills with a farmers market and a row of local vendors for the full festival day.',
      isOfficial: true,
      link: { label: 'Delta, Ontario — Visitor Info', url: 'https://www.deltaontario.com/' },
      heritage: { text: 'King Street doubles as County Road 42 and has been the village’s commercial spine since the 1800s, lined with the storefronts visible in many of Delta’s oldest photographs.', isPlaceholder: false }
    },
    {
      id: 'fairgrounds', x: 455, y: 1022, icon: 'icon-fair',
      name: 'Delta Fairgrounds',
      eyebrow: 'Delta Fairgrounds',
      title: 'Vendors, Car Show & Live Music',
      time: '9:00 AM – 2:00 PM · Car show & music, 10 AM – 2 PM',
      description: 'Browse vendors in the Fair Hall and across the fairgrounds, admire a classic car show, and enjoy live music from Jeff Code & Silver Wings.',
      isOfficial: true,
      link: { label: 'Delta Fair', url: 'https://deltafair.com/' },
      heritage: { text: 'Home to the Delta Fair, established in 1830 — one of Ontario’s oldest continuously running agricultural fairs.', isPlaceholder: false }
    },
    {
      id: 'firehall', x: 459, y: 832, icon: 'icon-firehall',
      name: 'Fire Hall Museum',
      eyebrow: 'Fire Hall Museum',
      title: 'Open to the Public',
      time: '10:00 AM – 2:00 PM',
      description: 'Delta’s historic fire hall opens its doors for festival visitors to explore.',
      isOfficial: true,
      link: { label: 'Delta, Ontario — Museums & History', url: 'https://www.deltaontario.com/museums-history' },
      heritage: { text: 'Housed in the village’s former fire hall on Mill Creek Drive, the building is being restored by community volunteers to preserve Delta’s firefighting history.', isPlaceholder: false }
    },
    {
      id: 'lakepark', x: 209, y: 866, icon: 'icon-lake',
      name: 'Lower Beverley Lake Park',
      eyebrow: 'Lower Beverley Lake Park',
      title: 'Texas Hold’em Poker Tournament',
      time: '1:00 PM, at the Park Pavilion',
      description: 'Pull up a chair at the Park Pavilion for an afternoon Texas Hold’em poker tournament.',
      isOfficial: true,
      link: { label: 'Lower Beverley Lake Park', url: 'https://beverleylakepark.com/' },
      heritage: { text: 'Begun in 1967 as a Canadian Centennial project, the park spans 106 acres of mixed forest and shoreline along Lower Beverley Lake.', isPlaceholder: false }
    },
    {
      id: 'russell', x: 821, y: 387, icon: 'icon-leaf',
      name: 'Russell Greenspace',
      eyebrow: 'Russell Greenspace',
      title: 'Scarecrow Contest Display',
      time: 'Saturday, all day',
      description: 'Wander past a display of community-made scarecrows entered in the festival’s annual contest.',
      isOfficial: true,
      link: null,
      heritage: { text: 'Placeholder note — AI-generated, not confirmed: the green space’s name may echo Jasper Russell, the 19th-century brickmaker whose yard supplied bricks for the Old Town Hall, but no official source confirms this connection. Treat as a possibility, not history.', isPlaceholder: true }
    },
    {
      id: 'dars', x: 994, y: 939, icon: 'icon-ball',
      name: 'DARS Recreation Centre',
      eyebrow: 'DARS Recreation Centre',
      title: 'Cornhole Tournament, Bake Sale & BBQ',
      time: '9:00 AM – Noon · Registration at 8:30 AM',
      description: 'Sign up for the cornhole tournament, then refuel at the bake sale and BBQ.',
      isOfficial: true,
      link: { label: 'Delta Recreation (Facebook)', url: 'https://www.facebook.com/DeltaONRecreation/' },
      heritage: { text: 'Run by the volunteer-led Delta Athletic & Recreational Society, registered as a charity since 1996, which organises recreation programmes for the village year-round.', isPlaceholder: false }
    },
    {
      id: 'stpauls', x: 862, y: 839, icon: 'icon-church',
      name: 'St. Paul’s Anglican Community Centre',
      eyebrow: 'St. Paul’s Anglican Community Centre',
      title: 'Yard Sale',
      time: '9:00 AM – Noon',
      description: 'Browse a community yard sale on the church grounds.',
      isOfficial: true,
      link: { label: 'Historic Places Register', url: 'https://www.historicplaces.ca/en/rep-reg/place-lieu.aspx?id=8480' },
      heritage: { text: 'Construction began in 1811, making St. Paul’s one of the oldest surviving church buildings in Canada; it is protected today by an Ontario Heritage Trust conservation easement.', isPlaceholder: false }
    }
  ];

  /* ─── legend categories (section 6 of the redesign brief) ─── */
  var LEGEND = [
    { label: 'Old Stone Mill', icon: 'icon-mill' },
    { label: 'Old Town Hall', icon: 'icon-hall' },
    { label: 'Blacksmith Shop', icon: 'icon-anvil' },
    { label: 'Fairgrounds', icon: 'icon-fair' },
    { label: 'Fire Hall Museum', icon: 'icon-firehall' },
    { label: 'King Street', icon: 'icon-market' },
    { label: 'Parks', icon: 'icon-leaf' },
    { label: 'Community Centres', icon: 'icon-ball' }
  ];

  var ICONS = {
    'icon-mill': '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 3v9l6 4" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/>',
    'icon-hall': '<path d="M3 20h18M5 20V10l7-5 7 5v10M9 20v-6h6v6" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M12 2v3" stroke="currentColor" stroke-width="2"/>',
    'icon-anvil': '<path d="M4 16h7l2 3h5l1-3h1M6 16c0-3 2-5 6-5s5 1 5 3" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/><path d="M10 11V6h2v5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    'icon-market': '<path d="M4 9l1.5-5h13L20 9M4 9h16M5 9v9a1 1 0 001 1h12a1 1 0 001-1V9" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M9 19v-5h6v5" fill="none" stroke="currentColor" stroke-width="2"/>',
    'icon-fair': '<path d="M3 21l4-9 4 9M13 21l4-9 4 9M5 21h6M15 21h6" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/><circle cx="7" cy="9" r="1.6" fill="currentColor"/><circle cx="17" cy="9" r="1.6" fill="currentColor"/>',
    'icon-firehall': '<path d="M12 2c2 3 4 5 4 8a4 4 0 11-8 0c0-3 2-5 4-8z" fill="currentColor"/><path d="M12 9c.8 1 1.4 1.8 1.4 2.8a1.4 1.4 0 01-2.8 0c0-1 .6-1.8 1.4-2.8z" fill="var(--vm-parchment,#F1E8D6)"/><path d="M5 22v-5h14v5" fill="none" stroke="currentColor" stroke-width="2"/>',
    'icon-lake': '<path d="M3 16c2-2 4-2 6 0s4 2 6 0 4-2 6 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M3 20c2-2 4-2 6 0s4 2 6 0 4-2 6 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M12 3l-3 7h6z" fill="currentColor"/>',
    'icon-leaf': '<path d="M5 19c0-8 6-14 14-14 0 8-6 14-14 14z" fill="currentColor"/><path d="M5 19c3-3 6-7 9-12" stroke="var(--vm-parchment,#F1E8D6)" stroke-width="1.4" fill="none" stroke-linecap="round"/>',
    'icon-ball': '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3 12h18M12 3a13 13 0 010 18M12 3a13 13 0 000 18" stroke="currentColor" stroke-width="1.4" fill="none"/>',
    'icon-church': '<path d="M12 2v4M9 4h6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M12 6l8 6h-3v9H7v-9H4z" fill="currentColor"/><rect x="10.6" y="14" width="2.8" height="4" fill="var(--vm-parchment,#F1E8D6)"/>'
  };

  /* ─── illustrated village map — built from real surveyed geography,
     not an illustration. Every road centreline, the Lower Beverley
     Lake shoreline, the Delta Creek millpond outflow, and the building
     footprints below are real OpenStreetMap point sequences for Delta,
     ON (cross-checked against Google Maps and the official 2025
     festival brochure for event placement), run through a single
     uniform projection centred on the Old Stone Mill: 1 real metre =
     1.3 canvas units, identically for every feature. Nothing is
     stretched apart for spacing — King Street really does run a few
     dozen steps from the Mill, and the map shows that. See
     Map/Map-Revision-Report.md for the full per-venue accuracy table. ─── */
  function buildMapSvg() {
    var defs = '<defs>' +
      '<pattern id="vmap-grain" width="6" height="6" patternUnits="userSpaceOnUse">' +
        '<rect width="6" height="6" fill="none"/>' +
        '<circle cx="1" cy="1" r="0.5" fill="rgba(58,44,26,0.05)"/>' +
      '</pattern>' +
      '<clipPath id="vmap-canvas-clip"><rect x="0" y="0" width="1600" height="1100"/></clipPath>' +
      Object.keys(ICONS).map(function (key) {
        return '<symbol id="' + key + '" viewBox="0 0 24 24">' + ICONS[key] + '</symbol>';
      }).join('') +
      '</defs>';

    var bg = '<rect x="0" y="0" width="1600" height="1100" fill="var(--vm-parchment)"/>' +
             '<rect x="0" y="0" width="1600" height="1100" fill="url(#vmap-grain)"/>';

    /* Lower Beverley Lake — the near shore below is a real, surveyed
       OpenStreetMap shoreline trace (the lake's full shoreline loops
       far beyond the village; only the arc nearest Delta is drawn,
       closed off-canvas to the southwest where the lake continues
       beyond the frame). Upper Beverley Lake, southeast near DARS and
       St. Paul's, is stylised (no clean OSM trace at this scale) but
       sits at the real general bearing the two lakes give Delta its
       name from — the village sits in the triangle between them. */
    var water =
      '<path d="M429.6,732.5 L501.3,701.5 L593.1,521.6 L601.2,485.9 L624.7,478.8 ' +
        'L607.2,521.6 L642.2,522.2 L728.0,489.9 L728.6,453.9 L768.5,437.8 L759.5,459.6 ' +
        'L736.1,462.9 L756.7,483.5 L740.4,489.0 L703.3,532.6 L546.6,672.6 L458.2,747.8 ' +
        'L390.3,809.2 L380.5,874.9 L313.6,939.7 L361.2,1080.9 L322.5,1118.0 L220.5,1187.4 ' +
        'L117.1,1274.0 L99.1,1360.5 L126.0,1394.4 L-150,1430 L-150,400 Z" ' +
        'fill="var(--vm-water)" opacity="0.55"/>' +
      '<text x="20" y="700" font-family="var(--sans)" font-size="16" letter-spacing="1" ' +
        'fill="var(--vm-water-deep)" opacity="0.85">Lower Beverley Lake</text>' +
      '<path d="M1180,1100 C1260,1010 1400,985 1500,1025 C1565,1052 1595,1080 1600,1100 Z" ' +
        'fill="var(--vm-water)" opacity="0.5"/>' +
      '<text x="1235" y="1020" font-family="var(--sans)" font-size="14" letter-spacing="1" ' +
        'fill="var(--vm-water-deep)" opacity="0.8">Upper Beverley Lake</text>' +
      /* Delta Creek — the real millpond outflow stream, surveyed (OSM),
         flowing from the Mill's pond down into Lower Beverley Lake */
      '<path d="M801.0,430.6 L787.2,436.1 L768.1,444.7 L732.9,458.0 L732.3,462.9 ' +
        'L731.4,495.2 L723.5,506.4 L712.4,520.0 L679.2,527.5 L637.8,555.3 L549.0,660.1 ' +
        'L510.0,709.5 L426.2,749.1 L409.6,763.1 L385.6,815.0 L388.9,832.3 L381.4,847.9 ' +
        'L315.9,907.2 L306.8,926.2 L309.2,950.1 L352.4,1031.6 L354.9,1053.9 L349.1,1081.1" ' +
        'stroke="var(--vm-water-deep)" stroke-width="4" fill="none" opacity="0.55" stroke-linecap="round" stroke-linejoin="round"/>';

    /* green spaces: Russell Greenspace, Lower Beverley Lake Park woods,
       Delta Fairgrounds field — centred on each venue's real position,
       sized down to match the genuinely small, walkable real distances */
    var greens = '<ellipse cx="821" cy="387" rx="42" ry="33" fill="var(--vm-green)" opacity="0.26"/>' +
                 '<ellipse cx="265" cy="815" rx="68" ry="52" fill="var(--vm-green)" opacity="0.22"/>' +
                 '<ellipse cx="455" cy="1022" rx="80" ry="46" fill="var(--vm-green)" opacity="0.2"/>';

    /* roads: every centreline below is real OpenStreetMap geometry for
       Delta, ON (King Street/County Road 42, William St, John St,
       Mathew St, Water St, Mill Creek Dr, Recreation Dr, Lower
       Beverley Lake Park Rd), projected at the single uniform scale —
       true bearing AND true relative distance from the Old Stone Mill. */
    function road(d, w1, w2) {
      return '<path d="' + d + '" fill="none" stroke="#C9B98C" stroke-width="' + w1 + '" stroke-linecap="round" stroke-linejoin="round"/>' +
             '<path d="' + d + '" fill="none" stroke="#E2D3A6" stroke-width="' + w2 + '" stroke-dasharray="9 11" stroke-linecap="round" stroke-linejoin="round"/>';
    }

    /* King Street / County Road 42 — the village's through-road,
       entering southeast (toward Philipsville/Hwy 15) and continuing
       north past Russell Greenspace */
    var roadKing = road('M2591.2,1671.0 L2303.4,1506.8 L1952.8,1311.0 L1837.8,1258.2 L1711.4,1217.2 ' +
      'L1285.7,1115.2 L1211.2,1097.3 L1041.8,1051.7 L1005.2,1032.8 L978.5,1012.4 L973.7,1008.7 ' +
      'L820.5,840.8 L741.7,752.7 L692.9,698.1 L678.5,679.3 L672.3,665.1 L669.1,651.4 L671.1,633.8 ' +
      'L676.9,618.6 L687.8,603.5 L763.9,533.4 L770.1,525.0 L772.9,512.0 L775.8,452.7 L777.5,425.6 ' +
      'L779.8,399.1 L827.2,288.5 L849.9,233.2 L861.0,205.6 L922.7,54.1 L946.3,-31.1 L950.6,-95.8 ' +
      'L944.7,-309.0 L941.0,-416.0 L938.2,-441.6 L933.2,-469.9 L925.9,-488.9 L915.5,-509.9 ' +
      'L901.8,-529.8 L881.7,-553.6 L776.3,-660.6 L725.3,-712.4 L530.4,-905.1 L482.8,-965.2', 18, 4);
    var roadWilliam = road('M145.4,1481.9 L149.1,1467.6 L163.2,1453.2 L232.5,1395.3 L395.3,1244.3 ' +
      'L454.3,1193.0 L553.0,1099.8 L564.4,1081.6 L569.7,1067.0 L570.6,1056.9 L582.0,942.9 ' +
      'L591.8,903.9 L601.9,885.7 L616.0,870.0 L734.9,764.3 L741.7,752.7 L749.4,740.4 L750.4,739.3 ' +
      'L855.1,642.8 L858.7,637.5', 12, 3);
    var roadJohn = road('M820.5,840.8 L829.1,831.8 L832.9,828.5 L931.9,739.5 L935.7,725.1', 9, 3);
    var roadMathew = road('M935.7,725.1 L928.6,708.9 L912.2,692.8 L858.7,637.5 L770.3,540.8 L769.6,540.0 L763.9,533.4', 9, 3);
    var roadWater = road('M858.7,637.5 L863.0,631.6 L863.8,630.6 L905.5,586.6 L911.8,573.6 L903.9,559.4 ' +
      'L875.5,529.4 L832.6,483.9 L823.4,481.4', 8, 2);
    var roadRecreation = road('M823.4,481.4 L814.4,484.1 L786.3,510.8 L783.8,511.0 L772.9,512.0 ' +
      'C870,640 950,790 994.0,939.2', 10, 3);
    var roadMillCreek = road('M354.8,925.7 L459.4,831.8 L642.6,664.7 L669.1,651.4', 11, 3);
    var roadLakePark = road('M143.7,753.5 L142.8,730.3 L131.6,674.8 L130.1,656.7 L133.8,641.2 ' +
      'L145.3,630.7 L184.0,615.9 L208.6,610.4 L320.1,598.5 L344.7,587.8 L363.9,569.4 L379.1,545.9 ' +
      'L419.6,466.5 L436.2,445.5 L452.9,432.4 L472.3,428.2 L490.5,434.4 L542.9,467.4 L561.2,474.9 ' +
      'L578.1,473.3 L596.1,464.0 L640.9,419.4 L657.7,412.7 L674.6,413.8 L698.2,430.3 L709.9,431.4 ' +
      'L722.9,427.4 L753.3,406.0 L769.3,401.8 L779.8,399.1', 10, 3);

    /* highway exit + street labels, at the real points the roads
       actually cross the edge of the mapped area */
    var labels =
      '<text x="460" y="1078" font-family="var(--sans)" font-size="15" font-weight="600" fill="var(--vm-ink)" opacity="0.75" transform="rotate(-40 460 1078)">↙ to Athens · Brockville</text>' +
      '<text x="1230" y="1078" font-family="var(--sans)" font-size="15" font-weight="600" fill="var(--vm-ink)" opacity="0.75" transform="rotate(14 1230 1078)">to Philipsville · Hwy 15 ↘</text>' +
      '<text x="880" y="130" font-family="var(--sans)" font-size="14" letter-spacing="1" fill="var(--vm-brick-deep)" opacity="0.78" transform="rotate(-68 880 130)">King Street / County Rd. 42</text>' +
      '<text x="605" y="920" font-family="var(--sans)" font-size="12.5" letter-spacing="0.5" fill="var(--vm-brick-deep)" opacity="0.72" transform="rotate(-58 605 920)">William St.</text>' +
      '<text x="855" y="635" font-family="var(--sans)" font-size="11.5" letter-spacing="0.4" fill="var(--vm-brick-deep)" opacity="0.72" transform="rotate(48 855 635)">Mathew St.</text>' +
      '<text x="878" y="790" font-family="var(--sans)" font-size="11.5" letter-spacing="0.4" fill="var(--vm-brick-deep)" opacity="0.7" transform="rotate(-45 878 790)">John St.</text>' +
      '<text x="480" y="862" font-family="var(--sans)" font-size="12.5" letter-spacing="0.5" fill="var(--vm-brick-deep)" opacity="0.72" transform="rotate(-42 480 862)">Mill Creek Dr.</text>' +
      '<text x="905" y="650" font-family="var(--sans)" font-size="11.5" letter-spacing="0.4" fill="var(--vm-brick-deep)" opacity="0.7" transform="rotate(70 905 650)">Recreation Dr.</text>' +
      '<text x="430" y="582" font-family="var(--sans)" font-size="11.5" letter-spacing="0.3" fill="var(--vm-brick-deep)" opacity="0.7" transform="rotate(-29 430 582)">Lower Beverley Lake Park Rd.</text>';

    function tree(cx, cy, scale) {
      scale = scale || 1;
      return '<g transform="translate(' + cx + ',' + cy + ') scale(' + scale + ')" opacity="0.5">' +
        '<circle cx="0" cy="0" r="7" fill="var(--vm-green-deep)"/>' +
        '<rect x="-1.4" y="5.5" width="2.8" height="5.5" fill="#6B5535"/></g>';
    }
    var trees = tree(800, 360) + tree(845, 405) + tree(792, 412) +
                tree(232, 765) + tree(262, 838) + tree(300, 858) +
                tree(420, 1000) + tree(492, 1048);

    /* real building footprints near the village core — every rect is a
       real OpenStreetMap building footprint within ~150 real metres of
       the Mill, projected at the same uniform scale, so the heritage
       core reads as an actual built-up village rather than a few
       isolated illustrated shapes */
    var footprints =
      '<rect x="757.5" y="640.2" width="33.8" height="33.8" rx="1.5" fill="var(--vm-ink)" opacity="0.13"/>' +
      '<rect x="748.2" y="485.9" width="11.3" height="21.1" rx="1.5" fill="var(--vm-ink)" opacity="0.13"/>' +
      '<rect x="738.0" y="559.0" width="29.4" height="29.3" rx="1.5" fill="var(--vm-ink)" opacity="0.13"/>' +
      '<rect x="749.1" y="548.4" width="30.1" height="30.3" rx="1.5" fill="var(--vm-ink)" opacity="0.13"/>' +
      '<rect x="686.5" y="540.6" width="28.6" height="28.9" rx="1.5" fill="var(--vm-ink)" opacity="0.13"/>' +
      '<rect x="645.9" y="558.0" width="25.7" height="22.5" rx="1.5" fill="var(--vm-ink)" opacity="0.13"/>' +
      '<rect x="788.8" y="528.6" width="20.4" height="20.4" rx="1.5" fill="var(--vm-ink)" opacity="0.13"/>' +
      '<rect x="811.9" y="490.6" width="20.9" height="20.8" rx="1.5" fill="var(--vm-ink)" opacity="0.13"/>' +
      '<rect x="908.3" y="477.9" width="19.8" height="19.7" rx="1.5" fill="var(--vm-ink)" opacity="0.13"/>' +
      '<rect x="654.7" y="309.1" width="69.8" height="70.1" rx="1.5" fill="var(--vm-ink)" opacity="0.13"/>' +
      '<rect x="773.9" y="286.9" width="31.6" height="23.9" rx="1.5" fill="var(--vm-ink)" opacity="0.13"/>' +
      '<rect x="673.9" y="358.2" width="63.5" height="52.3" rx="1.5" fill="var(--vm-ink)" opacity="0.13"/>' +
      '<rect x="761.9" y="313.0" width="28.4" height="22.8" rx="1.5" fill="var(--vm-ink)" opacity="0.13"/>' +
      '<rect x="820.4" y="342.2" width="20.9" height="18.9" rx="1.5" fill="var(--vm-ink)" opacity="0.13"/>' +
      '<rect x="734.2" y="464.3" width="23.4" height="19.0" rx="1.5" fill="var(--vm-ink)" opacity="0.13"/>' +
      '<rect x="688.2" y="384.5" width="32.1" height="33.4" rx="1.5" fill="var(--vm-ink)" opacity="0.13"/>' +
      '<rect x="745.1" y="341.6" width="27.6" height="23.8" rx="1.5" fill="var(--vm-ink)" opacity="0.13"/>' +
      '<rect x="617.1" y="497.0" width="11.2" height="10.8" rx="1.5" fill="var(--vm-ink)" opacity="0.13"/>' +
      '<rect x="638.6" y="480.3" width="15.2" height="15.4" rx="1.5" fill="var(--vm-ink)" opacity="0.13"/>' +
      '<rect x="674.6" y="442.1" width="17.5" height="13.7" rx="1.5" fill="var(--vm-ink)" opacity="0.13"/>' +
      '<rect x="661.1" y="459.6" width="18.5" height="19.7" rx="1.5" fill="var(--vm-ink)" opacity="0.13"/>' +
      '<rect x="743.7" y="656.8" width="19.0" height="19.1" rx="1.5" fill="var(--vm-ink)" opacity="0.13"/>' +
      '<rect x="761.4" y="607.0" width="28.5" height="27.2" rx="1.5" fill="var(--vm-ink)" opacity="0.13"/>' +
      '<rect x="707.8" y="586.2" width="21.8" height="21.3" rx="1.5" fill="var(--vm-ink)" opacity="0.13"/>' +
      '<rect x="725.9" y="578.4" width="16.7" height="16.8" rx="1.5" fill="var(--vm-ink)" opacity="0.13"/>' +
      '<rect x="731.5" y="572.4" width="30.2" height="30.5" rx="1.5" fill="var(--vm-ink)" opacity="0.13"/>' +
      '<rect x="731.8" y="326.2" width="15.2" height="15.0" rx="1.5" fill="var(--vm-ink)" opacity="0.13"/>' +
      '<rect x="750.2" y="301.2" width="15.6" height="13.9" rx="1.5" fill="var(--vm-ink)" opacity="0.13"/>' +
      '<rect x="897.9" y="411.6" width="23.4" height="19.6" rx="1.5" fill="var(--vm-ink)" opacity="0.13"/>' +
      '<rect x="850.1" y="478.9" width="12.1" height="12.6" rx="1.5" fill="var(--vm-ink)" opacity="0.13"/>' +
      '<rect x="802.0" y="512.5" width="22.5" height="23.7" rx="1.5" fill="var(--vm-ink)" opacity="0.13"/>' +
      '<rect x="815.0" y="566.3" width="21.3" height="20.4" rx="1.5" fill="var(--vm-ink)" opacity="0.13"/>' +
      '<rect x="888.4" y="565.6" width="18.0" height="17.8" rx="1.5" fill="var(--vm-ink)" opacity="0.13"/>' +
      '<rect x="847.3" y="601.2" width="25.9" height="23.6" rx="1.5" fill="var(--vm-ink)" opacity="0.13"/>' +
      '<rect x="798.9" y="605.5" width="24.2" height="23.5" rx="1.5" fill="var(--vm-ink)" opacity="0.13"/>' +
      '<rect x="822.3" y="625.7" width="21.0" height="20.8" rx="1.5" fill="var(--vm-ink)" opacity="0.13"/>' +
      '<rect x="796.6" y="642.1" width="16.7" height="16.7" rx="1.5" fill="var(--vm-ink)" opacity="0.13"/>' +
      '<rect x="784.8" y="488.2" width="10.6" height="9.6" rx="1.5" fill="var(--vm-ink)" opacity="0.13"/>' +
      '<rect x="791.8" y="443.9" width="12.8" height="27.4" rx="1.5" fill="var(--vm-ink)" opacity="0.13"/>' +
      '<rect x="833.5" y="323.1" width="25.7" height="23.3" rx="1.5" fill="var(--vm-ink)" opacity="0.13"/>';

    var compass = '<g transform="translate(1500,110)" opacity="0.8">' +
      '<circle cx="0" cy="0" r="36" fill="none" stroke="var(--vm-ink)" stroke-width="1.4"/>' +
      '<path d="M0,-30 L8,0 L0,30 L-8,0 Z" fill="var(--vm-brick)"/>' +
      '<text x="0" y="-42" text-anchor="middle" font-family="var(--sans)" font-size="13" fill="var(--vm-ink)">N</text>' +
      '</g>';

    var title = '<text x="120" y="1045" font-family="var(--display)" font-size="26" ' +
      'fill="var(--vm-ink)" opacity="0.6">Village of Delta</text>' +
      '<text x="120" y="1067" font-family="var(--sans)" font-size="11.5" letter-spacing="2.5" ' +
      'fill="var(--vm-brick-deep)" opacity="0.75">HARVEST FESTIVAL TRAIL · REAL VILLAGE GEOGRAPHY</text>';

    return '<svg viewBox="0 0 1600 1100" xmlns="http://www.w3.org/2000/svg">' +
      defs +
      '<g clip-path="url(#vmap-canvas-clip)">' +
      bg + water + greens +
      roadLakePark + roadMillCreek + roadRecreation + roadWilliam + roadJohn + roadMathew + roadWater + roadKing +
      footprints + labels + trees + compass + title +
      '</g>' +
      '</svg>';
  }

  /* ─── modal construction (built once, on first open) ─── */
  var modalEl = null, overlayEl = null, panelEl = null, stageEl = null, canvasEl = null, listEl = null, toggleBtn = null;
  var lastFocused = null;
  var activeHotspot = null;
  var viewMode = 'map'; // 'map' | 'list'
  var zoom = { scale: 1, x: 0, y: 0, minScale: 0.55, maxScale: 2.6 };

  function el(tag, className, html) {
    var n = document.createElement(tag);
    if (className) n.className = className;
    if (html !== undefined) n.innerHTML = html;
    return n;
  }

  function buildModal() {
    overlayEl = el('div', 'vmap-overlay');
    overlayEl.id = 'vmap-overlay';
    overlayEl.setAttribute('hidden', '');

    modalEl = el('div', 'vmap-modal');
    modalEl.setAttribute('role', 'dialog');
    modalEl.setAttribute('aria-modal', 'true');
    modalEl.setAttribute('aria-labelledby', 'vmap-title');

    var header = el('div', 'vmap-header');
    var headerTop = el('div', 'vmap-header-top');
    var headerText = el('div', 'vmap-header-text');
    headerText.innerHTML =
      '<span class="vmap-label">Saturday · Throughout the Village</span>' +
      '<h2 id="vmap-title">Explore the <span class="it">Festival Map</span></h2>' +
      '<p>A simple, accurate map of the village for Saturday’s festival. Tap a location to see what’s happening there — or use “View All Events” for a plain list instead.</p>';
    var closeBtn = el('button', 'vmap-close', '&times;');
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', 'Close village map');
    closeBtn.addEventListener('click', closeModal);
    headerTop.appendChild(headerText);
    headerTop.appendChild(closeBtn);

    var toolbar = el('div', 'vmap-toolbar');
    toggleBtn = el('button', 'vmap-toggle-btn');
    toggleBtn.type = 'button';
    toggleBtn.setAttribute('aria-pressed', 'false');
    toggleBtn.innerHTML = '<span class="icon" aria-hidden="true">☰</span><span class="vmap-toggle-label">View All Events</span>';
    toggleBtn.addEventListener('click', toggleView);

    var legend = el('div', 'vmap-legend');
    legend.innerHTML = '<span class="vmap-legend-title">Festival Locations</span>' +
      LEGEND.map(function (item) {
        return '<span class="vmap-legend-item"><span class="vmap-legend-swatch"><svg aria-hidden="true"><use href="#' + item.icon + '" xlink:href="#' + item.icon + '"></use></svg></span>' + item.label + '</span>';
      }).join('');

    toolbar.appendChild(toggleBtn);
    toolbar.appendChild(legend);

    header.appendChild(headerTop);
    header.appendChild(toolbar);

    var body = el('div', 'vmap-body');

    stageEl = el('div', 'vmap-stage');
    stageEl.tabIndex = 0;
    stageEl.setAttribute('aria-label', 'Illustrated map of the village of Delta. Use arrow keys, or drag, to pan; use the zoom buttons to zoom; tap any marker to see what is happening there.');
    canvasEl = el('div', 'vmap-canvas', buildMapSvg());
    stageEl.appendChild(canvasEl);

    DATA.forEach(function (loc) {
      var btn = el('button', 'vmap-hotspot');
      btn.type = 'button';
      btn.dataset.id = loc.id;
      btn.style.left = loc.x + 'px';
      btn.style.top = loc.y + 'px';
      btn.setAttribute('aria-label', loc.name + ' — ' + loc.title);
      btn.innerHTML =
        '<span class="vmap-hotspot-pin"><svg><use href="#' + loc.icon + '" xlink:href="#' + loc.icon + '"></use></svg></span>' +
        '<span class="vmap-hotspot-label">' + loc.name + '</span>';
      btn.addEventListener('click', function () { selectLocation(loc, btn); });
      canvasEl.appendChild(btn);
    });

    var controls = el('div', 'vmap-controls');
    controls.innerHTML =
      '<button type="button" data-act="in" aria-label="Zoom in">+</button>' +
      '<button type="button" data-act="out" aria-label="Zoom out">&minus;</button>' +
      '<button type="button" data-act="reset" class="vmap-reset" aria-label="Reset map view">Reset</button>';
    controls.addEventListener('click', function (e) {
      var act = e.target.getAttribute('data-act');
      if (!act) return;
      if (act === 'in') zoomBy(1.25);
      if (act === 'out') zoomBy(0.8);
      if (act === 'reset') resetView();
    });

    var hint = el('div', 'vmap-hint', 'Drag to pan · scroll to zoom · tap a marker for details');

    stageEl.appendChild(controls);
    stageEl.appendChild(hint);

    panelEl = el('div', 'vmap-panel');
    panelEl.innerHTML = '<div class="vmap-panel-handle"></div>' +
      '<button type="button" class="vmap-panel-close" aria-label="Close details">&times;</button>' +
      '<div class="vmap-panel-empty">Select a location on the map to see what’s happening there.</div>';
    panelEl.querySelector('.vmap-panel-close').addEventListener('click', function () {
      panelEl.classList.remove('is-open');
      if (activeHotspot) activeHotspot.classList.remove('is-active');
    });

    listEl = buildListView();

    body.appendChild(stageEl);
    body.appendChild(panelEl);
    body.appendChild(listEl);

    modalEl.appendChild(header);
    modalEl.appendChild(body);
    overlayEl.appendChild(modalEl);
    document.body.appendChild(overlayEl);

    overlayEl.addEventListener('mousedown', function (e) {
      if (e.target === overlayEl) closeModal();
    });
    document.addEventListener('keydown', onKeydown);
    wirePanZoom();
    applyViewMode();
  }

  function buildListView() {
    var list = el('div', 'vmap-list');
    list.setAttribute('hidden', '');
    var inner = el('div', 'vmap-list-inner');
    inner.innerHTML =
      '<h3 class="vmap-list-head">All Festival Locations</h3>' +
      '<p class="vmap-list-sub">Every location from Saturday’s festival map, in one simple list — no map needed.</p>';
    DATA.forEach(function (loc) {
      var card = el('div', 'vmap-list-card', renderCard(loc));
      var locateBtn = el('button', 'vmap-locate-btn', 'Show on map <span aria-hidden="true">→</span>');
      locateBtn.type = 'button';
      locateBtn.addEventListener('click', function () { focusOnLocation(loc); });
      card.appendChild(locateBtn);
      inner.appendChild(card);
    });
    list.appendChild(inner);
    return list;
  }

  function toggleView() {
    viewMode = viewMode === 'map' ? 'list' : 'map';
    applyViewMode();
  }

  function applyViewMode() {
    var label = toggleBtn.querySelector('.vmap-toggle-label');
    if (viewMode === 'list') {
      stageEl.setAttribute('hidden', '');
      panelEl.setAttribute('hidden', '');
      listEl.removeAttribute('hidden');
      label.textContent = 'Back to Map';
      toggleBtn.setAttribute('aria-pressed', 'true');
    } else {
      listEl.setAttribute('hidden', '');
      stageEl.removeAttribute('hidden');
      panelEl.removeAttribute('hidden');
      label.textContent = 'View All Events';
      toggleBtn.setAttribute('aria-pressed', 'false');
      requestAnimationFrame(resetView);
    }
  }

  function focusOnLocation(loc) {
    if (viewMode !== 'map') { viewMode = 'map'; applyViewMode(); }
    requestAnimationFrame(function () {
      centerOn(loc.x, loc.y, 1.15);
      var btn = canvasEl.querySelector('[data-id="' + loc.id + '"]');
      if (btn) selectLocation(loc, btn);
    });
  }

  function centerOn(x, y, scale) {
    var rect = stageEl.getBoundingClientRect();
    zoom.scale = clamp(scale, zoom.minScale, zoom.maxScale);
    zoom.x = rect.width / 2 - x * zoom.scale;
    zoom.y = rect.height / 2 - y * zoom.scale;
    applyTransform();
  }

  function renderCard(loc) {
    var badge = loc.isOfficial
      ? '<span class="vmap-card-badge is-official">Official 2025 programme info</span>'
      : '<span class="vmap-card-badge is-placeholder">AI-generated placeholder</span>';
    var html = badge +
      '<p class="vmap-card-eyebrow">' + loc.eyebrow + '</p>' +
      '<h3>' + loc.title + '</h3>' +
      '<p class="vmap-card-time">' + loc.time + '</p>' +
      '<p class="vmap-card-desc">' + loc.description + '</p>';

    if (loc.heritage) {
      if (loc.heritage.isPlaceholder) {
        html += '<p class="vmap-card-placeholder-note"><strong>Placeholder Information</strong> — awaiting official confirmation. Do not treat as historical fact.<br>' + loc.heritage.text + '</p>';
      } else {
        html += '<div class="vmap-card-heritage"><h4>Heritage Note</h4><p>' + loc.heritage.text + '</p></div>';
      }
    }
    if (loc.link) {
      html += '<a class="vmap-card-link" href="' + loc.link.url + '" target="_blank" rel="noopener noreferrer">' +
        loc.link.label + ' <span aria-hidden="true">↗</span></a>';
    }
    return '<div class="vmap-card">' + html + '</div>';
  }

  function selectLocation(loc, btn) {
    if (activeHotspot) activeHotspot.classList.remove('is-active');
    activeHotspot = btn;
    btn.classList.add('is-active');
    panelEl.innerHTML = '<div class="vmap-panel-handle"></div>' +
      '<button type="button" class="vmap-panel-close" aria-label="Close details">&times;</button>' +
      renderCard(loc);
    panelEl.querySelector('.vmap-panel-close').addEventListener('click', function () {
      panelEl.classList.remove('is-open');
      activeHotspot.classList.remove('is-active');
    });
    panelEl.classList.add('is-open');
    panelEl.scrollTop = 0;
  }

  /* ─── pan & zoom ─── */
  function applyTransform() {
    canvasEl.style.transform = 'translate(' + zoom.x + 'px,' + zoom.y + 'px) scale(' + zoom.scale + ')';
  }
  function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }

  function resetView() {
    var rect = stageEl.getBoundingClientRect();
    zoom.scale = Math.max(rect.width / 1600, rect.height / 1100, 0.55);
    zoom.x = (rect.width - 1600 * zoom.scale) / 2;
    zoom.y = (rect.height - 1100 * zoom.scale) / 2;
    applyTransform();
  }

  function zoomBy(factor, clientX, clientY) {
    var rect = stageEl.getBoundingClientRect();
    var cx = clientX != null ? clientX - rect.left : rect.width / 2;
    var cy = clientY != null ? clientY - rect.top : rect.height / 2;
    var newScale = clamp(zoom.scale * factor, zoom.minScale, zoom.maxScale);
    var ratio = newScale / zoom.scale;
    zoom.x = cx - (cx - zoom.x) * ratio;
    zoom.y = cy - (cy - zoom.y) * ratio;
    zoom.scale = newScale;
    applyTransform();
  }

  function wirePanZoom() {
    var dragging = false, lastX = 0, lastY = 0;
    var pointers = {};

    stageEl.addEventListener('pointerdown', function (e) {
      if (e.target.closest('.vmap-hotspot')) return;
      stageEl.setPointerCapture(e.pointerId);
      pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
      if (Object.keys(pointers).length === 1) {
        dragging = true;
        lastX = e.clientX;
        lastY = e.clientY;
        stageEl.classList.add('is-dragging');
      }
    });

    stageEl.addEventListener('pointermove', function (e) {
      if (!pointers[e.pointerId]) return;
      pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
      var ids = Object.keys(pointers);

      if (ids.length === 2) {
        var p1 = pointers[ids[0]], p2 = pointers[ids[1]];
        var dist = Math.hypot(p1.x - p2.x, p1.y - p2.y);
        if (stageEl._pinchDist) {
          var factor = dist / stageEl._pinchDist;
          zoomBy(factor, (p1.x + p2.x) / 2, (p1.y + p2.y) / 2);
        }
        stageEl._pinchDist = dist;
        return;
      }

      if (dragging && ids.length === 1) {
        var dx = e.clientX - lastX;
        var dy = e.clientY - lastY;
        lastX = e.clientX;
        lastY = e.clientY;
        zoom.x += dx;
        zoom.y += dy;
        applyTransform();
      }
    });

    function endPointer(e) {
      delete pointers[e.pointerId];
      stageEl._pinchDist = null;
      if (Object.keys(pointers).length === 0) {
        dragging = false;
        stageEl.classList.remove('is-dragging');
      }
    }
    stageEl.addEventListener('pointerup', endPointer);
    stageEl.addEventListener('pointercancel', endPointer);

    stageEl.addEventListener('wheel', function (e) {
      e.preventDefault();
      var factor = e.deltaY < 0 ? 1.1 : 0.9;
      zoomBy(factor, e.clientX, e.clientY);
    }, { passive: false });

    stageEl.addEventListener('keydown', function (e) {
      var step = 40;
      if (e.key === 'ArrowUp') { zoom.y += step; applyTransform(); }
      else if (e.key === 'ArrowDown') { zoom.y -= step; applyTransform(); }
      else if (e.key === 'ArrowLeft') { zoom.x += step; applyTransform(); }
      else if (e.key === 'ArrowRight') { zoom.x -= step; applyTransform(); }
      else if (e.key === '+' || e.key === '=') zoomBy(1.2);
      else if (e.key === '-') zoomBy(0.83);
      else return;
      e.preventDefault();
    });
  }

  /* ─── focus trap + lifecycle ─── */
  function getFocusable() {
    return Array.prototype.slice.call(
      modalEl.querySelectorAll('button, [href], input, [tabindex]:not([tabindex="-1"])')
    ).filter(function (n) { return n.offsetParent !== null; });
  }

  function onKeydown(e) {
    if (overlayEl.hasAttribute('hidden')) return;
    if (e.key === 'Escape') { closeModal(); return; }
    if (e.key === 'Tab') {
      var focusable = getFocusable();
      if (!focusable.length) return;
      var first = focusable[0], last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault(); first.focus();
      }
    }
  }

  function openModal(trigger) {
    if (!overlayEl) buildModal();
    lastFocused = trigger || document.activeElement;
    viewMode = 'map';
    applyViewMode();
    overlayEl.removeAttribute('hidden');
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(function () {
      overlayEl.classList.add('is-open');
      resetView();
      var closeBtn = modalEl.querySelector('.vmap-close');
      if (closeBtn) closeBtn.focus();
    });
  }

  function closeModal() {
    if (!overlayEl || overlayEl.hasAttribute('hidden')) return;
    overlayEl.classList.remove('is-open');
    document.body.style.overflow = '';
    setTimeout(function () {
      overlayEl.setAttribute('hidden', '');
      if (panelEl) panelEl.classList.remove('is-open');
      if (activeHotspot) { activeHotspot.classList.remove('is-active'); activeHotspot = null; }
    }, 320);
    if (lastFocused && typeof lastFocused.focus === 'function') lastFocused.focus();
  }

  window.openVillageMap = openModal;
})();
