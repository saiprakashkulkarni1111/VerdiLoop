export type CircularCategory =
  | 'segregation'
  | 'recycling'
  | 'ewaste'
  | 'informal_recycler'
  | 'rooftop_solar'
  | 'ev_nudge'
  | 'active_transit';

export interface UrbanNodeProperties {
  cluster?: boolean;
  cluster_id?: number;
  point_count?: number;
  point_count_abbreviated?: string | number;
  id: string;
  name: string;
  category: CircularCategory;
  district: string;
  address: string;
  status: 'Operational' | 'High Demand' | 'Peak Solar';
  capacityPct: number;
  carbonFactorKgPerUnit: number;
  pointsPerUnit: number;
  unit: 'kg' | 'kWh' | 'km';
  verifiedMethod: string;
  detailMetric: string;
  operatingHours: string;
}

export interface GeoJSONPointFeature {
  type: 'Feature';
  id: string;
  properties: UrbanNodeProperties;
  geometry: {
    type: 'Point';
    coordinates: [number, number]; // [lng, lat]
  };
}

export interface GeoJSONFeatureCollection {
  type: 'FeatureCollection';
  features: GeoJSONPointFeature[];
}

export const CATEGORY_META: Record<
  CircularCategory,
  {
    label: string;
    shortLabel: string;
    unit: 'kg' | 'kWh' | 'km';
    carbonPerUnit: number;
    pointsPerUnit: number;
    defaultMethod: string;
    colorHex: string;
    description: string;
  }
> = {
  segregation: {
    label: 'Source Segregation',
    shortLabel: 'Segregation',
    unit: 'kg',
    carbonPerUnit: 0.85,
    pointsPerUnit: 18,
    defaultMethod: 'AWS IoT Core Smart Bin Scale',
    colorHex: '#059669',
    description: '4-stream wet organic, dry recyclable, glass, and sanitary sorting at source.',
  },
  recycling: {
    label: 'Material Recycling',
    shortLabel: 'Recycling',
    unit: 'kg',
    carbonPerUnit: 1.45,
    pointsPerUnit: 25,
    defaultMethod: 'AWS IoT Greengrass MRF Weighbridge',
    colorHex: '#0284c7',
    description: 'High-recovery PET, HDPE, aluminum, and corrugated fiber circular recovery.',
  },
  ewaste: {
    label: 'E-Waste Recovery',
    shortLabel: 'E-Waste',
    unit: 'kg',
    carbonPerUnit: 3.8,
    pointsPerUnit: 60,
    defaultMethod: 'AWS Lambda Hazard Manifest QR',
    colorHex: '#7c3aed',
    description: 'Safe extraction of lithium-ion cells, printed circuit boards, and rare earth metals.',
  },
  informal_recycler: {
    label: 'Informal Recyclers Co-op',
    shortLabel: 'Informal Co-ops',
    unit: 'kg',
    carbonPerUnit: 1.65,
    pointsPerUnit: 35,
    defaultMethod: 'AWS AppSync Co-op Digital Weigh',
    colorHex: '#d97706',
    description: 'Direct doorstep collection and fair-price payouts with authorized waste-picker collectives.',
  },
  rooftop_solar: {
    label: 'Rooftop Solar Export',
    shortLabel: 'Rooftop Solar',
    unit: 'kWh',
    carbonPerUnit: 0.42,
    pointsPerUnit: 12,
    defaultMethod: 'Amazon Timestream Smart Inverter',
    colorHex: '#eab308',
    description: 'Decentralized clean feeder generation and peer-to-grid net metering.',
  },
  ev_nudge: {
    label: 'EV Solar & Mode Nudge',
    shortLabel: 'EV Nudges',
    unit: 'kWh',
    carbonPerUnit: 0.58,
    pointsPerUnit: 16,
    defaultMethod: 'Amazon EventBridge Charger Telemetry',
    colorHex: '#0d9488',
    description: 'Midday solar-surplus EV charging and park-and-ride transit transfer nudges.',
  },
  active_transit: {
    label: 'Public Transit & Bike-Share',
    shortLabel: 'Transit & Bike',
    unit: 'km',
    carbonPerUnit: 0.21,
    pointsPerUnit: 15,
    defaultMethod: 'AWS API Gateway Transit & Dock Feed',
    colorHex: '#2563eb',
    description: 'Verified car-free trips across municipal rail, electric bus, and docked bike-sharing.',
  },
};

const DISTRICTS = [
  { name: 'Mission District', center: [-122.4194, 37.7599] },
  { name: 'SoMa Circular Zone', center: [-122.4056, 37.7785] },
  { name: 'Civic Center & Hayes', center: [-122.4212, 37.7765] },
  { name: 'Embarcadero & FiDi', center: [-122.3965, 37.7936] },
  { name: 'Castro & Upper Market', center: [-122.435, 37.7609] },
  { name: 'Potrero & Dogpatch', center: [-122.3928, 37.7602] },
  { name: 'Haight & Panhandle', center: [-122.4481, 37.7699] },
  { name: 'Marina & North Beach', center: [-122.4156, 37.8015] },
  { name: 'Sunset Eco Corridor', center: [-122.4785, 37.7595] },
  { name: 'Richmond Microgrid', center: [-122.4752, 37.7802] },
] as const;

const NODE_TEMPLATES: {
  category: CircularCategory;
  prefix: string;
  detailPrefix: string;
}[] = [
  { category: 'segregation', prefix: '4-Stream Smart Kiosk', detailPrefix: '96.4% purity score' },
  { category: 'recycling', prefix: 'Circular MRF Drop-Off', detailPrefix: 'Optical polymer sorter' },
  { category: 'ewaste', prefix: 'Safe E-Waste & Battery Vault', detailPrefix: 'UN38.3 Li-Ion certified' },
  { category: 'informal_recycler', prefix: 'Waste-Picker Co-op Hub', detailPrefix: '100% fair-wage payout' },
  { category: 'rooftop_solar', prefix: 'Community Solar Microgrid', detailPrefix: '185 kWp feeder export' },
  { category: 'ev_nudge', prefix: 'Solar-Sync EV & Park-Ride', detailPrefix: 'Midday -40% tariff nudge' },
  { category: 'active_transit', prefix: 'Bike-Share & Transit Hub', detailPrefix: '28 e-bikes + GTFS realtime' },
];

// Deterministic seeded generator for 140 realistic urban nodes so Supercluster renders dense, interactive clusters
function buildUrbanNodes(): GeoJSONFeatureCollection {
  const features: GeoJSONPointFeature[] = [];
  let counter = 1;

  for (let dIdx = 0; dIdx < DISTRICTS.length; dIdx++) {
    const district = DISTRICTS[dIdx];
    for (let tIdx = 0; tIdx < NODE_TEMPLATES.length; tIdx++) {
      const tpl = NODE_TEMPLATES[tIdx];
      const meta = CATEGORY_META[tpl.category];

      // Create 2 nodes of each category per district (10 * 7 * 2 = 140 nodes)
      for (let replica = 0; replica < 2; replica++) {
        const seed = (dIdx * 31 + tIdx * 17 + replica * 13) % 97;
        const angle = (seed / 97) * Math.PI * 2;
        const radius = 0.0022 + ((seed % 7) * 0.0014);
        const lng = Number((district.center[0] + Math.cos(angle) * radius * 1.25).toFixed(6));
        const lat = Number((district.center[1] + Math.sin(angle) * radius).toFixed(6));

        const id = `node_${counter}`;
        const capacityPct = 32 + ((seed * 3) % 62);
        const status: UrbanNodeProperties['status'] =
          tpl.category === 'rooftop_solar' || tpl.category === 'ev_nudge'
            ? 'Peak Solar'
            : capacityPct > 80
            ? 'High Demand'
            : 'Operational';

        features.push({
          type: 'Feature',
          id,
          geometry: {
            type: 'Point',
            coordinates: [lng, lat],
          },
          properties: {
            id,
            name: `${district.name.split(' ')[0]} ${tpl.prefix} #${replica + 1}`,
            category: tpl.category,
            district: district.name,
            address: `${100 + counter * 12} ${district.name.split(' ')[0]} Ave, San Francisco, CA`,
            status,
            capacityPct,
            carbonFactorKgPerUnit: meta.carbonPerUnit,
            pointsPerUnit: meta.pointsPerUnit,
            unit: meta.unit,
            verifiedMethod: meta.defaultMethod,
            detailMetric: tpl.detailPrefix,
            operatingHours: '06:00 – 22:00 Daily',
          },
        });
        counter++;
      }
    }
  }

  return {
    type: 'FeatureCollection',
    features,
  };
}

export const URBAN_NODES_GEOJSON: GeoJSONFeatureCollection = buildUrbanNodes();

export interface MunicipalCorridor {
  id: string;
  title: string;
  origin: string;
  destination: string;
  recommendedMode: 'BICYCLING' | 'TRANSIT' | 'WALKING';
  carBaselineCo2KgPerKm: number;
  activeModeCo2KgPerKm: number;
  transitAgency: string;
  nudgeHighlight: string;
}

export const MUNICIPAL_CORRIDORS: MunicipalCorridor[] = [
  {
    id: 'corridor_mission_fidi',
    title: 'Mission 16th St Plaza → Embarcadero Transit Center',
    origin: '16th St Mission Station, San Francisco, CA',
    destination: 'Embarcadero Station, San Francisco, CA',
    recommendedMode: 'TRANSIT',
    carBaselineCo2KgPerKm: 0.24,
    activeModeCo2KgPerKm: 0.03,
    transitAgency: 'BART / Muni Metro Zero-Emission Rail',
    nudgeHighlight: 'Avoids 4.8 km of Market St congestion & parking surcharge; 2.2x EcoCredits multiplier.',
  },
  {
    id: 'corridor_castro_soma',
    title: 'Castro Market Bikeway → Townsend Caltrain Hub',
    origin: 'Castro Station, San Francisco, CA',
    destination: 'San Francisco Caltrain Station, 700 4th St, San Francisco, CA',
    recommendedMode: 'BICYCLING',
    carBaselineCo2KgPerKm: 0.24,
    activeModeCo2KgPerKm: 0.0,
    transitAgency: 'Bay Wheels Municipal Bike-Share Protected Lane',
    nudgeHighlight: '100% protected green-wave cycle track via Valencia & Townsend.',
  },
  {
    id: 'corridor_haight_civic',
    title: 'Panhandle Bike-Share Dock → Civic Center Solar Plaza',
    origin: 'fell st and masonic ave, San Francisco, CA',
    destination: 'Civic Center Plaza, San Francisco, CA',
    recommendedMode: 'BICYCLING',
    carBaselineCo2KgPerKm: 0.24,
    activeModeCo2KgPerKm: 0.0,
    transitAgency: 'Wiggle Low-Grade Cycle Network',
    nudgeHighlight: 'Uses the 1.2% average incline Wiggle route to bypass steep hills effortlessly.',
  },
  {
    id: 'corridor_dogpatch_ferry',
    title: 'Dogpatch 22nd St → Ferry Building Multimodal Terminal',
    origin: '22nd St & 3rd St, San Francisco, CA',
    destination: 'Ferry Building, San Francisco, CA',
    recommendedMode: 'TRANSIT',
    carBaselineCo2KgPerKm: 0.24,
    activeModeCo2KgPerKm: 0.02,
    transitAgency: 'Muni T-Third Light Rail (100% Hydro/Solar Powered)',
    nudgeHighlight: 'Powered 100% by Hetch Hetchy clean municipal hydro and solar feed-in.',
  },
];

export interface LocalRewardItem {
  id: string;
  title: string;
  partnerName: string;
  category: string;
  pointsCost: number;
  impactRequirement: string;
  description: string;
}

export const REWARDS_CATALOG: LocalRewardItem[] = [
  {
    id: 'rew_muni_day_pass',
    title: '3-Day Municipal Zero-Emission Transit Pass',
    partnerName: 'SFMTA Municipal Transit Agency',
    category: 'Public Transit',
    pointsCost: 250,
    impactRequirement: 'Verified active commute',
    description: 'Unlimited rides on electric trolleybuses, Muni Metro light rail, and streetcars.',
  },
  {
    id: 'rew_bikeshare_60',
    title: '120 Minutes E-Bike Share Unlock Credit',
    partnerName: 'Metro Bike-Share Network',
    category: 'Bike-Sharing',
    pointsCost: 180,
    impactRequirement: 'Car-free route nudge',
    description: 'Waives e-bike per-minute fees across all 140+ municipal solar-powered docking stations.',
  },
  {
    id: 'rew_solar_bill_credit',
    title: '$15 Community Rooftop Solar Bill Credit',
    partnerName: 'CleanPowerSF Microgrid Cooperative',
    category: 'Clean Energy',
    pointsCost: 420,
    impactRequirement: 'Solar or EV smart-charge',
    description: 'Direct utility bill offset funded by neighborhood rooftop solar net-metering surplus.',
  },
  {
    id: 'rew_farmers_compost',
    title: '$10 Civic Center Farmers Market & Compost Voucher',
    partnerName: 'Heart of the City Farmers Collective',
    category: 'Segregation & Loop',
    pointsCost: 150,
    impactRequirement: 'Wet/Dry segregation log',
    description: 'Redeemable for local organic produce grown with municipal closed-loop compost.',
  },
  {
    id: 'rew_coop_priority',
    title: 'Zero-Fee Doorstep E-Waste & Dry Recyclables Pickup',
    partnerName: 'Alliance of Informal Recyclers Co-op',
    category: 'Informal Recyclers',
    pointsCost: 200,
    impactRequirement: 'E-waste or recycling log',
    description: 'Supports dignified livelihoods for registered informal waste pickers with verified digital scales.',
  },
  {
    id: 'rew_ev_midday_charge',
    title: '25 kWh Midday Solar-Surplus Fast Charge Credit',
    partnerName: 'Municipal Curbside EV Network',
    category: 'EV Nudges',
    pointsCost: 320,
    impactRequirement: 'Off-peak EV nudge',
    description: 'Valid between 10:00 and 15:00 when municipal rooftop solar generation peaks.',
  },
];
