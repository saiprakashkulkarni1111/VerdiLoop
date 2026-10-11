/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { APIProvider } from '@vis.gl/react-google-maps';
import {
  ArrowRight,
  LogOut,
  Search,
} from 'lucide-react';
import {
  ActivityLogRecord,
  CognitoUserSession,
  getDynamoUserProfile,
  getStoredCognitoSession,
  putDynamoActivityLog,
  putDynamoRedemption,
  putDynamoUserProfile,
  queryDynamoActivityLogs,
  queryDynamoRedemptions,
  RedemptionRecord,
  sanitizeId,
  sanitizeString,
  SCHEMA_CONSTRAINTS,
  signInWithAwsCognito,
  signOutAwsCognito,
  updateDynamoRedemptionStatus,
  UserProfileData,
} from './services/awsCloud';
import {
  CATEGORY_META,
  CircularCategory,
  MUNICIPAL_CORRIDORS,
  REWARDS_CATALOG,
  URBAN_NODES_GEOJSON,
  UrbanNodeProperties,
} from './data/urbanNodes';
import { ActiveRouteResult, UrbanClusterMap } from './components/UrbanClusterMap';

type NavTab = 'map' | 'circular' | 'transit' | 'rewards';

const BASELINE_LEADERBOARD: UserProfileData[] = [
  {
    uid: 'civic_champion_1',
    displayName: 'Elena Rostova',
    neighborhood: 'Mission District',
    isPublicLeaderboard: true,
    totalCarbonSavedKg: 412.8,
    wasteRecycledKg: 164.5,
    cleanEnergyKwh: 320.0,
    activeTransitKm: 295.4,
    ecoPoints: 4820,
    streakDays: 34,
  },
  {
    uid: 'civic_champion_2',
    displayName: 'Marcus Chen',
    neighborhood: 'SoMa Circular Zone',
    isPublicLeaderboard: true,
    totalCarbonSavedKg: 368.2,
    wasteRecycledKg: 128.0,
    cleanEnergyKwh: 290.5,
    activeTransitKm: 240.0,
    ecoPoints: 4190,
    streakDays: 27,
  },
  {
    uid: 'civic_champion_3',
    displayName: 'Priya Nair',
    neighborhood: 'Castro & Upper Market',
    isPublicLeaderboard: true,
    totalCarbonSavedKg: 319.6,
    wasteRecycledKg: 142.2,
    cleanEnergyKwh: 180.0,
    activeTransitKm: 210.8,
    ecoPoints: 3740,
    streakDays: 21,
  },
  {
    uid: 'civic_champion_4',
    displayName: 'Mateo Alvarez',
    neighborhood: 'Potrero & Dogpatch',
    isPublicLeaderboard: true,
    totalCarbonSavedKg: 284.5,
    wasteRecycledKg: 118.4,
    cleanEnergyKwh: 215.0,
    activeTransitKm: 168.0,
    ecoPoints: 3280,
    streakDays: 19,
  },
];

const INITIAL_GUEST_PROFILE: UserProfileData = {
  uid: 'guest_preview',
  displayName: 'Urban Citizen (Guest)',
  neighborhood: 'Mission District',
  isPublicLeaderboard: true,
  totalCarbonSavedKg: 148.6,
  wasteRecycledKg: 62.4,
  cleanEnergyKwh: 115.0,
  activeTransitKm: 94.2,
  ecoPoints: 1640,
  streakDays: 12,
};

const INITIAL_GUEST_LOGS: ActivityLogRecord[] = [
  {
    id: 'guest_log_1',
    userId: 'guest_preview',
    category: 'segregation',
    title: '4-Stream Wet Organic & Dry Polymer Segregation',
    hubName: 'Mission 4-Stream Smart Kiosk #1',
    carbonSavedKg: 5.1,
    pointsEarned: 108,
    metricValue: 6.0,
    metricUnit: 'kg',
    verifiedMethod: 'AWS IoT Core Smart Bin Scale',
    createdAtMs: Date.now() - 3600 * 1000 * 5,
  },
  {
    id: 'guest_log_2',
    userId: 'guest_preview',
    category: 'informal_recycler',
    title: 'Doorstep Corrugated Fiber & Aluminum Handover',
    hubName: 'SoMa Waste-Picker Co-op Hub #1',
    carbonSavedKg: 13.2,
    pointsEarned: 280,
    metricValue: 8.0,
    metricUnit: 'kg',
    verifiedMethod: 'AWS AppSync Co-op Digital Weigh',
    createdAtMs: Date.now() - 3600 * 1000 * 22,
  },
  {
    id: 'guest_log_3',
    userId: 'guest_preview',
    category: 'active_transit',
    title: 'Verified Bike-Share Commute (Castro → Caltrain)',
    hubName: 'Castro Bike-Share & Transit Hub #1',
    carbonSavedKg: 1.3,
    pointsEarned: 93,
    metricValue: 6.2,
    metricUnit: 'km',
    verifiedMethod: 'AWS API Gateway Transit & Dock Feed',
    createdAtMs: Date.now() - 3600 * 1000 * 46,
  },
];

const MAPS_API_KEY = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string) || '';

export default function App() {
  const [activeTab, setActiveTab] = useState<NavTab>('map');

  // AWS Cognito Auth & Amazon DynamoDB Sync State
  const [currentUser, setCurrentUser] = useState<CognitoUserSession | null>(null);
  const [authBannerMsg, setAuthBannerMsg] = useState<string | null>(null);

  const [profile, setProfile] = useState<UserProfileData>(INITIAL_GUEST_PROFILE);
  const [activityLogs, setActivityLogs] = useState<ActivityLogRecord[]>(INITIAL_GUEST_LOGS);
  const [redemptions, setRedemptions] = useState<RedemptionRecord[]>([]);

  // Map & Supercluster Filter State
  const [categoryFilter, setCategoryFilter] = useState<'all' | CircularCategory>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedNode, setSelectedNode] = useState<UrbanNodeProperties | null>(
    URBAN_NODES_GEOJSON.features[0]?.properties || null
  );
  const [clusterDrilldown, setClusterDrilldown] = useState<{
    clusterId: number;
    leaves: UrbanNodeProperties[];
    expansionZoom: number;
  } | null>(null);
  const [clusterStats, setClusterStats] = useState<{
    visibleClusters: number;
    totalNodes: number;
  }>({
    visibleClusters: 18,
    totalNodes: URBAN_NODES_GEOJSON.features.length,
  });

  // Action Logging Modal / Drawer State
  const [logCategory, setLogCategory] = useState<CircularCategory>('segregation');
  const [logQuantity, setLogQuantity] = useState<string>('4.5');
  const [logNote, setLogNote] = useState<string>('Sorted wet compost & dry PET packaging');
  const [isSubmittingLog, setIsSubmittingLog] = useState<boolean>(false);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);

  // Google Maps Routes API Commute Verification State
  const [routeOrigin, setRouteOrigin] = useState<string>(MUNICIPAL_CORRIDORS[0].origin);
  const [routeDestination, setRouteDestination] = useState<string>(
    MUNICIPAL_CORRIDORS[0].destination
  );
  const [routeMode, setRouteMode] = useState<'BICYCLING' | 'TRANSIT' | 'WALKING' | 'DRIVING'>(
    'TRANSIT'
  );
  const [routeTrigger, setRouteTrigger] = useState<number>(0);
  const [computedRoute, setComputedRoute] = useState<ActiveRouteResult | null>(null);
  const [routeError, setRouteError] = useState<string | null>(null);

  // Neighborhood editing
  const [editingNeighborhood, setEditingNeighborhood] = useState<string>(
    INITIAL_GUEST_PROFILE.neighborhood
  );

  // 1. AWS Cognito Session & DynamoDB Bootstrap
  useEffect(() => {
    const existingSession = getStoredCognitoSession();
    if (existingSession) {
      setCurrentUser(existingSession);
      void (async () => {
        const loadedProfile = await getDynamoUserProfile(existingSession.sub, {
          ...INITIAL_GUEST_PROFILE,
          uid: existingSession.sub,
          displayName: existingSession.displayName,
        });
        setProfile(loadedProfile);
        setEditingNeighborhood(loadedProfile.neighborhood);
        const loadedLogs = await queryDynamoActivityLogs(existingSession.sub, INITIAL_GUEST_LOGS);
        setActivityLogs(loadedLogs);
        const loadedRedemptions = await queryDynamoRedemptions(existingSession.sub);
        setRedemptions(loadedRedemptions);
      })();
    }
  }, []);

  // Filtered GeoJSON for Supercluster
  const filteredGeojson = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const features = URBAN_NODES_GEOJSON.features.filter((f) => {
      const matchesCat = categoryFilter === 'all' || f.properties.category === categoryFilter;
      const matchesSearch =
        q.length === 0 ||
        f.properties.name.toLowerCase().includes(q) ||
        f.properties.district.toLowerCase().includes(q) ||
        f.properties.address.toLowerCase().includes(q);
      return matchesCat && matchesSearch;
    });
    return {
      type: 'FeatureCollection' as const,
      features,
    };
  }, [categoryFilter, searchQuery]);

  // Sync selected node category with quick-logger
  const handleSelectNode = useCallback((node: UrbanNodeProperties) => {
    setSelectedNode(node);
    setLogCategory(node.category);
    setLogNote(`Verified ${CATEGORY_META[node.category].shortLabel} at ${node.name}`);
  }, []);

  const handleSelectClusterLeaves = useCallback(
    (clusterId: number, leaves: UrbanNodeProperties[], expansionZoom: number) => {
      setClusterDrilldown({ clusterId, leaves, expansionZoom });
      if (leaves.length > 0) {
        setSelectedNode(leaves[0]);
      }
    },
    []
  );

  const handleClusterStatsChange = useCallback((visibleClusters: number, totalNodes: number) => {
    setClusterStats({ visibleClusters, totalNodes });
  }, []);

  const handleRouteComputed = useCallback(
    (result: ActiveRouteResult | null, errorMsg: string | null) => {
      setComputedRoute(result);
      setRouteError(errorMsg);
    },
    []
  );

  // AWS Cognito Sign-In Handler
  const handleGoogleSignIn = async () => {
    setAuthBannerMsg(null);
    try {
      const session = await signInWithAwsCognito();
      setCurrentUser(session);
      const syncedProfile = await getDynamoUserProfile(session.sub, {
        ...profile,
        uid: session.sub,
        displayName: session.displayName,
      });
      setProfile(syncedProfile);
      setEditingNeighborhood(syncedProfile.neighborhood);
      const syncedLogs = await queryDynamoActivityLogs(session.sub, activityLogs);
      setActivityLogs(syncedLogs);
      const syncedRedemptions = await queryDynamoRedemptions(session.sub);
      setRedemptions(syncedRedemptions);
      setStatusNotice(
        'Authenticated via AWS Cognito SSO. Real-time AWS AppSync & Amazon DynamoDB sync is active.'
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Sign-in cancelled';
      setAuthBannerMsg(`AWS Cognito note: ${msg}`);
    }
  };

  const handleSignOut = async () => {
    await signOutAwsCognito();
    setCurrentUser(null);
    setProfile(INITIAL_GUEST_PROFILE);
    setStatusNotice('Signed out of AWS Cognito. Viewing AWS Amplify Edge Preview.');
  };

  // Record a Sustainability Action via AWS DynamoDB & IoT Core Telemetry
  const recordImpactAction = async (params: {
    category: CircularCategory;
    metricValue: number;
    title: string;
    hubName: string;
    verifiedMethod?: string;
  }) => {
    setIsSubmittingLog(true);
    setStatusNotice(null);

    const meta = CATEGORY_META[params.category];
    const cleanQty = Math.min(10000, Math.max(0.1, Number(params.metricValue.toFixed(2))));
    const carbonSavedKg = Number((cleanQty * meta.carbonPerUnit).toFixed(2));
    const pointsEarned = Math.max(5, Math.round(cleanQty * meta.pointsPerUnit));

    const addWaste =
      params.category === 'segregation' ||
      params.category === 'recycling' ||
      params.category === 'ewaste' ||
      params.category === 'informal_recycler'
        ? cleanQty
        : 0;
    const addEnergy =
      params.category === 'rooftop_solar' || params.category === 'ev_nudge' ? cleanQty : 0;
    const addTransit = params.category === 'active_transit' ? cleanQty : 0;

    const ownerUid = currentUser ? currentUser.sub : profile.uid;
    const logId = sanitizeId(`log_${Date.now()}_${Math.floor(Math.random() * 1000)}`);

    const newLog: ActivityLogRecord = {
      id: logId,
      userId: sanitizeId(ownerUid),
      category: params.category,
      title: sanitizeString(params.title, SCHEMA_CONSTRAINTS.TITLE_MAX_LEN),
      hubName: sanitizeString(params.hubName, SCHEMA_CONSTRAINTS.HUB_NAME_MAX_LEN),
      carbonSavedKg,
      pointsEarned,
      metricValue: cleanQty,
      metricUnit: meta.unit,
      verifiedMethod: sanitizeString(
        params.verifiedMethod || meta.defaultMethod,
        SCHEMA_CONSTRAINTS.VERIFIED_METHOD_MAX_LEN
      ),
      createdAtMs: Date.now(),
    };

    const nextProfile: UserProfileData = {
      ...profile,
      totalCarbonSavedKg: Number((profile.totalCarbonSavedKg + carbonSavedKg).toFixed(2)),
      wasteRecycledKg: Number((profile.wasteRecycledKg + addWaste).toFixed(2)),
      cleanEnergyKwh: Number((profile.cleanEnergyKwh + addEnergy).toFixed(2)),
      activeTransitKm: Number((profile.activeTransitKm + addTransit).toFixed(2)),
      ecoPoints: profile.ecoPoints + pointsEarned,
      streakDays: profile.streakDays + 1,
    };

    const updatedLogs = await putDynamoActivityLog(newLog, activityLogs);
    await putDynamoUserProfile(nextProfile);

    setActivityLogs(updatedLogs);
    setProfile(nextProfile);
    setIsSubmittingLog(false);
    setStatusNotice(
      `Verified +${carbonSavedKg} kg CO2e saved and +${pointsEarned} EcoCredits persisted to Amazon DynamoDB.`
    );
  };

  const handleQuickLogSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseFloat(logQuantity);
    if (isNaN(parsed) || parsed <= 0) {
      setStatusNotice('Please enter a valid positive quantity.');
      return;
    }
    const targetHub = selectedNode ? selectedNode.name : 'Mission Circular Hub #1';
    await recordImpactAction({
      category: logCategory,
      metricValue: parsed,
      title: logNote || `Logged ${CATEGORY_META[logCategory].label}`,
      hubName: targetHub,
    });
  };

  // Redeem Local Reward via Amazon DynamoDB & EventBridge
  const handleRedeemReward = async (rewardId: string) => {
    const reward = REWARDS_CATALOG.find((r) => r.id === rewardId);
    if (!reward) return;

    if (profile.ecoPoints < reward.pointsCost) {
      setStatusNotice(
        `Insufficient EcoCredits. You need ${reward.pointsCost - profile.ecoPoints} more credits.`
      );
      return;
    }

    const voucherCode = `VL-${Math.random().toString(36).substring(2, 6).toUpperCase()}-${Math.floor(
      1000 + Math.random() * 9000
    )}`;

    const ownerUid = currentUser ? currentUser.sub : profile.uid;
    const redemptionId = sanitizeId(`redemp_${Date.now()}`);

    const newRedemp: RedemptionRecord = {
      id: redemptionId,
      userId: sanitizeId(ownerUid),
      rewardId: sanitizeId(reward.id),
      rewardTitle: sanitizeString(reward.title, SCHEMA_CONSTRAINTS.REWARD_TITLE_MAX_LEN),
      partnerName: sanitizeString(reward.partnerName, SCHEMA_CONSTRAINTS.PARTNER_NAME_MAX_LEN),
      pointsCost: reward.pointsCost,
      voucherCode: sanitizeId(voucherCode),
      status: 'active',
      createdAtMs: Date.now(),
    };

    const nextProfile: UserProfileData = {
      ...profile,
      ecoPoints: profile.ecoPoints - reward.pointsCost,
    };

    const updatedRedemptions = await putDynamoRedemption(newRedemp, redemptions);
    await putDynamoUserProfile(nextProfile);

    setRedemptions(updatedRedemptions);
    setProfile(nextProfile);
    setStatusNotice(`Redeemed "${reward.title}" via Amazon EventBridge — Voucher Code: ${voucherCode}`);
  };

  const handleMarkVoucherUsed = async (redemption: RedemptionRecord) => {
    if (redemption.status === 'used') return;
    const ownerUid = currentUser ? currentUser.sub : profile.uid;
    const updated = await updateDynamoRedemptionStatus(
      ownerUid,
      redemption.id,
      'used',
      redemptions
    );
    setRedemptions(updated);
  };

  const handleSaveNeighborhood = async () => {
    const cleanNeighborhood = sanitizeString(
      editingNeighborhood,
      SCHEMA_CONSTRAINTS.NEIGHBORHOOD_MAX_LEN,
      'Mission District'
    );
    const nextProfile: UserProfileData = {
      ...profile,
      neighborhood: cleanNeighborhood,
    };
    await putDynamoUserProfile(nextProfile);
    setProfile(nextProfile);
    setStatusNotice(`Synced district (${cleanNeighborhood}) to Amazon DynamoDB.`);
  };

  // Merge baseline civic leaders + current user for Leaderboard
  const combinedLeaderboard = useMemo(() => {
    const mapByUid = new Map<string, UserProfileData>();
    BASELINE_LEADERBOARD.forEach((item) => mapByUid.set(item.uid, item));
    mapByUid.set(profile.uid, profile);
    return Array.from(mapByUid.values()).sort(
      (a, b) => b.totalCarbonSavedKg - a.totalCarbonSavedKg
    );
  }, [profile]);

  return (
    <APIProvider apiKey={MAPS_API_KEY} version="beta">
      <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
        {/* Strict 3-Zone Top Bar Contract */}
        <header className="flex items-center justify-between gap-8 px-6 py-4 bg-white border-b border-slate-200 sticky top-0 z-40">
          {/* Zone 1: Single text element wordmark */}
          <a
            href="#top"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('map');
            }}
            className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
          >
            VerdiLoop
          </a>

          {/* Zone 2: 5 concise single-line navigation links */}
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
            <button
              type="button"
              onClick={() => setActiveTab('map')}
              className={`py-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer border-b-2 ${
                activeTab === 'map'
                  ? 'border-emerald-700 text-slate-950 font-semibold'
                  : 'border-transparent hover:text-slate-900'
              }`}
            >
              Cluster Map
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('circular')}
              className={`py-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer border-b-2 ${
                activeTab === 'circular'
                  ? 'border-emerald-700 text-slate-950 font-semibold'
                  : 'border-transparent hover:text-slate-900'
              }`}
            >
              Waste & Solar
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('transit')}
              className={`py-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer border-b-2 ${
                activeTab === 'transit'
                  ? 'border-emerald-700 text-slate-950 font-semibold'
                  : 'border-transparent hover:text-slate-900'
              }`}
            >
              Transit & EV
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('rewards')}
              className={`py-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer border-b-2 ${
                activeTab === 'rewards'
                  ? 'border-emerald-700 text-slate-950 font-semibold'
                  : 'border-transparent hover:text-slate-900'
              }`}
            >
              Leaderboard & Rewards
            </button>
          </nav>

          {/* Zone 3: 1 Primary Action */}
          <div className="flex items-center gap-3 shrink-0">
            {currentUser ? (
              <button
                type="button"
                onClick={handleSignOut}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-slate-800 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <span>{profile.displayName}</span>
                <LogOut className="w-3.5 h-3.5 text-slate-500" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleGoogleSignIn}
                className="px-4 py-2 text-xs font-semibold text-white bg-emerald-700 rounded-lg hover:bg-emerald-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Sign In to Sync
              </button>
            )}
          </div>
        </header>

        {/* Mobile Secondary Tab Switcher */}
        <div className="flex md:hidden items-center gap-2 overflow-x-auto px-4 py-2.5 bg-white border-b border-slate-200">
          {(
            [
              ['map', 'Cluster Map'],
              ['circular', 'Waste & Solar'],
              ['transit', 'Transit & EV'],
              ['rewards', 'Rewards'],
            ] as [NavTab, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setActiveTab(key)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap shrink-0 ${
                activeTab === key ? 'bg-slate-900 text-white' : 'text-slate-600 bg-slate-100'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Status Notification Strip */}
        {(statusNotice || authBannerMsg) && (
          <div className="bg-emerald-950 text-emerald-50 px-6 py-2.5 text-xs flex items-center justify-between gap-4">
            <span>{statusNotice || authBannerMsg}</span>
            <button
              type="button"
              onClick={() => {
                setStatusNotice(null);
                setAuthBannerMsg(null);
              }}
              className="text-emerald-200 hover:text-white underline whitespace-nowrap shrink-0 cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Main Workspace Container (1440px max-w baseline) */}
        <main className="flex-1 max-w-[1400px] w-full mx-auto px-6 py-8 space-y-8">
          {/* Executive Impact Summary Strip */}
          <section className="bg-white border border-slate-200 rounded-lg p-6">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6 pb-6 border-b border-slate-200">
              <div className="space-y-1.5 max-w-2xl">
                <div className="text-xs text-slate-500">
                  <span>Urban Circularity & Active Mobility Platform</span>
                  <span aria-hidden="true"> · </span>
                  <span>{profile.neighborhood}</span>
                  <span aria-hidden="true"> · </span>
                  <span>
                    {currentUser
                      ? 'Synced via AWS AppSync & Amazon DynamoDB'
                      : 'AWS Amplify Edge Preview'}
                  </span>
                </div>
                <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight text-balance">
                  Close the loop on what a city throws away and cut what it burns.
                </h1>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <label htmlFor="district-select" className="text-xs text-slate-500 whitespace-nowrap">
                    District:
                  </label>
                  <select
                    id="district-select"
                    value={editingNeighborhood}
                    onChange={(e) => setEditingNeighborhood(e.target.value)}
                    className="text-xs border border-slate-300 rounded-md px-2.5 py-1.5 bg-white text-slate-800"
                  >
                    <option value="Mission District">Mission District</option>
                    <option value="SoMa Circular Zone">SoMa Circular Zone</option>
                    <option value="Civic Center & Hayes">Civic Center & Hayes</option>
                    <option value="Castro & Upper Market">Castro & Upper Market</option>
                    <option value="Potrero & Dogpatch">Potrero & Dogpatch</option>
                    <option value="Embarcadero & FiDi">Embarcadero & FiDi</option>
                  </select>
                  <button
                    type="button"
                    onClick={handleSaveNeighborhood}
                    className="px-3 py-1.5 text-xs font-medium bg-slate-900 text-white rounded-md hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    Save District
                  </button>
                </div>
              </div>
            </div>

            {/* 4-Column Tabular KPI Strip */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 pt-6">
              <div>
                <div className="text-xs text-slate-500">Real-Time Carbon Avoided</div>
                <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-1">
                  {profile.totalCarbonSavedKg.toFixed(1)} <span className="text-sm font-normal text-slate-500">kg CO2e</span>
                </div>
                <div className="text-xs text-emerald-700 mt-1">
                  <span>{profile.streakDays}-day verified streak</span>
                  <span aria-hidden="true"> · </span>
                  <span>Top 8% in {profile.neighborhood}</span>
                </div>
              </div>

              <div>
                <div className="text-xs text-slate-500">Waste Segregated & Recycled</div>
                <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-1">
                  {profile.wasteRecycledKg.toFixed(1)} <span className="text-sm font-normal text-slate-500">kg</span>
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  <span>Segregation</span>
                  <span aria-hidden="true"> · </span>
                  <span>E-Waste</span>
                  <span aria-hidden="true"> · </span>
                  <span>Informal Co-ops</span>
                </div>
              </div>

              <div>
                <div className="text-xs text-slate-500">Rooftop Solar & EV Smart Shift</div>
                <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-1">
                  {profile.cleanEnergyKwh.toFixed(1)} <span className="text-sm font-normal text-slate-500">kWh</span>
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  <span>Peer microgrid export</span>
                  <span aria-hidden="true"> · </span>
                  <span>Midday EV solar sync</span>
                </div>
              </div>

              <div>
                <div className="text-xs text-slate-500">Redeemable EcoCredits Balance</div>
                <div className="text-2xl font-bold font-mono tabular-nums text-emerald-700 mt-1">
                  {profile.ecoPoints.toLocaleString()} <span className="text-sm font-normal text-slate-500">credits</span>
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  <span>{profile.activeTransitKm.toFixed(1)} km car-free transit & bike</span>
                </div>
              </div>
            </div>
          </section>

          {/* TAB 1: GOOGLE MAPS + SUPERCLUSTER GEOSPATIAL EXPLORER */}
          {activeTab === 'map' && (
            <section className="space-y-6">
              {/* Interactive Filter Controls Bar */}
              <div className="bg-white border border-slate-200 rounded-lg p-4 flex flex-col xl:flex-row xl:items-center justify-between gap-4">
                <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg overflow-x-auto">
                  <button
                    type="button"
                    onClick={() => setCategoryFilter('all')}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      categoryFilter === 'all'
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    All Nodes ({URBAN_NODES_GEOJSON.features.length})
                  </button>
                  {(Object.keys(CATEGORY_META) as CircularCategory[]).map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setCategoryFilter(cat)}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        categoryFilter === cat
                          ? 'bg-white text-slate-900 shadow-sm'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {CATEGORY_META[cat].shortLabel}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-3">
                  <div className="relative flex-1 sm:w-64">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Filter by district or facility..."
                      className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded-md bg-white text-slate-900 focus:outline-none focus:border-slate-900"
                    />
                  </div>
                  <div className="text-xs text-slate-500 font-mono tabular-nums whitespace-nowrap hidden sm:block">
                    {clusterStats.visibleClusters} viewport clusters · {clusterStats.totalNodes} pts
                  </div>
                </div>
              </div>

              {/* 12-Column Split: 8-Col Google Maps Supercluster Canvas + 4-Col Cluster Drilldown & Action Logger */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                <div className="lg:col-span-8 space-y-4">
                  <UrbanClusterMap
                    filteredGeojson={filteredGeojson}
                    selectedNode={selectedNode}
                    onSelectNode={handleSelectNode}
                    onSelectClusterLeaves={handleSelectClusterLeaves}
                    onClusterStatsChange={handleClusterStatsChange}
                    routeOrigin={routeOrigin}
                    routeDestination={routeDestination}
                    routeMode={routeMode}
                    routeTrigger={routeTrigger}
                    onRouteComputed={handleRouteComputed}
                  />

                  {/* Cluster Drill-Down Table (populated when user clicks any dense Supercluster marker) */}
                  {clusterDrilldown && (
                    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                      <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
                        <div>
                          <h3 className="text-sm font-semibold text-slate-900">
                            Supercluster Drill-Down: Cluster #{clusterDrilldown.clusterId} (
                            {clusterDrilldown.leaves.length} Facilities)
                          </h3>
                          <p className="text-xs text-slate-500">
                            Expansion zoom target: z{clusterDrilldown.expansionZoom} · Select any facility below to inspect or log impact
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setClusterDrilldown(null)}
                          className="text-xs text-slate-500 hover:text-slate-900 cursor-pointer whitespace-nowrap"
                        >
                          Close Drill-Down
                        </button>
                      </div>
                      <div className="max-h-60 overflow-y-auto divide-y divide-slate-200">
                        {clusterDrilldown.leaves.map((leaf) => {
                          const meta = CATEGORY_META[leaf.category];
                          return (
                            <div
                              key={leaf.id}
                              className="px-5 py-3 flex items-center justify-between gap-4 hover:bg-slate-50 text-xs"
                            >
                              <div>
                                <div className="font-semibold text-slate-900">{leaf.name}</div>
                                <div className="text-slate-500 mt-0.5">
                                  <span>{meta.label}</span>
                                  <span aria-hidden="true"> · </span>
                                  <span>{leaf.district}</span>
                                  <span aria-hidden="true"> · </span>
                                  <span>{leaf.detailMetric}</span>
                                </div>
                              </div>
                              <div className="flex items-center gap-3 shrink-0">
                                <span className="font-mono tabular-nums text-emerald-700 font-semibold">
                                  +{leaf.pointsPerUnit} pts/{leaf.unit}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleSelectNode(leaf)}
                                  className="px-2.5 py-1 text-xs font-medium bg-slate-900 text-white rounded hover:bg-slate-800 cursor-pointer whitespace-nowrap"
                                >
                                  Select Hub
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* Right 4-Col Inspector & Verified Impact Logger */}
                <div className="lg:col-span-4 space-y-6">
                  {/* Selected Facility Card */}
                  {selectedNode && (
                    <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
                      <div>
                        <div className="text-xs text-slate-500">
                          <span>{CATEGORY_META[selectedNode.category].label}</span>
                          <span aria-hidden="true"> · </span>
                          <span>{selectedNode.district}</span>
                          <span aria-hidden="true"> · </span>
                          <span>{selectedNode.status}</span>
                        </div>
                        <h2 className="text-base font-bold text-slate-900 mt-1">
                          {selectedNode.name}
                        </h2>
                        <p className="text-xs text-slate-600 mt-1">{selectedNode.address}</p>
                      </div>

                      <div className="grid grid-cols-2 gap-3 pt-3 border-t border-slate-200 text-xs">
                        <div>
                          <span className="text-slate-500">Carbon Factor</span>
                          <div className="font-mono font-semibold text-slate-900 tabular-nums mt-0.5">
                            {selectedNode.carbonFactorKgPerUnit} kg CO2e/{selectedNode.unit}
                          </div>
                        </div>
                        <div>
                          <span className="text-slate-500">Reward Rate</span>
                          <div className="font-mono font-semibold text-emerald-700 tabular-nums mt-0.5">
                            +{selectedNode.pointsPerUnit} EcoCredits/{selectedNode.unit}
                          </div>
                        </div>
                        <div>
                          <span className="text-slate-500">Verification</span>
                          <div className="font-medium text-slate-800 mt-0.5">
                            {selectedNode.verifiedMethod}
                          </div>
                        </div>
                        <div>
                          <span className="text-slate-500">Hub Load</span>
                          <div className="font-mono font-semibold text-slate-900 tabular-nums mt-0.5">
                            {selectedNode.capacityPct}% utilized
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Quick Log Action Form */}
                  <form
                    onSubmit={handleQuickLogSubmit}
                    className="bg-white border border-slate-200 rounded-lg p-5 space-y-4"
                  >
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900">
                        Log Verified Sustainability Action
                      </h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Updates real-time carbon savings and syncs to your leaderboard profile.
                      </p>
                    </div>

                    <div className="space-y-3">
                      <div>
                        <label
                          htmlFor="log-category"
                          className="block text-xs font-medium text-slate-700 mb-1"
                        >
                          Action Domain
                        </label>
                        <select
                          id="log-category"
                          value={logCategory}
                          onChange={(e) => setLogCategory(e.target.value as CircularCategory)}
                          className="w-full text-xs border border-slate-300 rounded-md px-3 py-2 bg-white text-slate-900"
                        >
                          {(Object.keys(CATEGORY_META) as CircularCategory[]).map((cat) => (
                            <option key={cat} value={cat}>
                              {CATEGORY_META[cat].label} ({CATEGORY_META[cat].unit})
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label
                          htmlFor="log-qty"
                          className="block text-xs font-medium text-slate-700 mb-1"
                        >
                          Quantity ({CATEGORY_META[logCategory].unit})
                        </label>
                        <input
                          id="log-qty"
                          type="number"
                          step="0.1"
                          min="0.1"
                          max="5000"
                          value={logQuantity}
                          onChange={(e) => setLogQuantity(e.target.value)}
                          className="w-full text-xs font-mono tabular-nums border border-slate-300 rounded-md px-3 py-2 bg-white text-slate-900"
                        />
                      </div>

                      <div>
                        <label
                          htmlFor="log-note"
                          className="block text-xs font-medium text-slate-700 mb-1"
                        >
                          Verification Summary
                        </label>
                        <input
                          id="log-note"
                          type="text"
                          maxLength={140}
                          value={logNote}
                          onChange={(e) => setLogNote(e.target.value)}
                          className="w-full text-xs border border-slate-300 rounded-md px-3 py-2 bg-white text-slate-900"
                        />
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-200 flex items-center justify-between text-xs">
                      <span className="text-slate-500">Estimated Impact:</span>
                      <span className="font-mono font-semibold text-emerald-700 tabular-nums">
                        +
                        {(
                          (parseFloat(logQuantity) || 0) *
                          CATEGORY_META[logCategory].carbonPerUnit
                        ).toFixed(2)}{' '}
                        kg CO2e · +
                        {Math.round(
                          (parseFloat(logQuantity) || 0) * CATEGORY_META[logCategory].pointsPerUnit
                        )}{' '}
                        pts
                      </span>
                    </div>

                    <button
                      type="submit"
                      disabled={isSubmittingLog}
                      className="w-full py-2.5 px-4 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                    >
                      {isSubmittingLog ? 'Recording Impact...' : 'Verify & Record Impact'}
                    </button>
                  </form>
                </div>
              </div>
            </section>
          )}

          {/* TAB 2: CIRCULAR WASTE, INFORMAL RECYCLERS & ROOFTOP SOLAR */}
          {activeTab === 'circular' && (
            <section className="space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* 1. Segregation, Recycling & E-Waste */}
                <div className="bg-white border border-slate-200 rounded-lg p-6 flex flex-col justify-between space-y-5">
                  <div className="space-y-2">
                    <div className="text-xs text-slate-500">
                      <span>Source Segregation & Material Recovery</span>
                      <span aria-hidden="true"> · </span>
                      <span>Zero-Landfill Protocol</span>
                    </div>
                    <h2 className="text-lg font-bold text-slate-900">
                      01. Segregation, Recycling & E-Waste
                    </h2>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      Divert organic wet waste into anaerobic digesters, recover clean dry polymers, and safely extract cobalt, lithium, and copper from household e-waste.
                    </p>
                  </div>

                  <div className="space-y-2 pt-4 border-t border-slate-200">
                    <button
                      type="button"
                      onClick={() =>
                        recordImpactAction({
                          category: 'segregation',
                          metricValue: 5.0,
                          title: '5 kg 4-Stream Household Wet & Dry Segregation',
                          hubName: 'Mission 4-Stream Smart Kiosk #1',
                        })
                      }
                      className="w-full flex items-center justify-between px-3.5 py-2 text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-900 rounded-md transition-colors cursor-pointer"
                    >
                      <span>Log 5 kg 4-Stream Segregation</span>
                      <span className="font-mono text-emerald-700 font-semibold tabular-nums">
                        +4.25 kg CO2e · +90 pts
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        recordImpactAction({
                          category: 'ewaste',
                          metricValue: 2.5,
                          title: '2.5 kg Lithium-Ion & Circuit Board E-Waste Vault Drop',
                          hubName: 'SoMa Safe E-Waste & Battery Vault #1',
                        })
                      }
                      className="w-full flex items-center justify-between px-3.5 py-2 text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-900 rounded-md transition-colors cursor-pointer"
                    >
                      <span>Log 2.5 kg Certified E-Waste Drop</span>
                      <span className="font-mono text-emerald-700 font-semibold tabular-nums">
                        +9.50 kg CO2e · +150 pts
                      </span>
                    </button>
                  </div>
                </div>

                {/* 2. Informal Recyclers Co-op Integration */}
                <div className="bg-white border border-slate-200 rounded-lg p-6 flex flex-col justify-between space-y-5">
                  <div className="space-y-2">
                    <div className="text-xs text-slate-500">
                      <span>Inclusive Circular Economy</span>
                      <span aria-hidden="true"> · </span>
                      <span>20 Authorized Micro-Co-ops</span>
                    </div>
                    <h2 className="text-lg font-bold text-slate-900">
                      02. Informal Recyclers Network
                    </h2>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      Formalize and empower informal waste-picker collectives with transparent digital weigh-scales, guaranteed municipal floor prices, and direct doorstep collection bookings.
                    </p>
                  </div>

                  <div className="space-y-2 pt-4 border-t border-slate-200">
                    <button
                      type="button"
                      onClick={() =>
                        recordImpactAction({
                          category: 'informal_recycler',
                          metricValue: 8.0,
                          title: '8 kg Doorstep Dry Recyclables Handover to Co-op Picker',
                          hubName: 'Mission Waste-Picker Co-op Hub #1',
                        })
                      }
                      className="w-full flex items-center justify-between px-3.5 py-2 text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-900 rounded-md transition-colors cursor-pointer"
                    >
                      <span>Verify 8 kg Co-op Doorstep Handover</span>
                      <span className="font-mono text-emerald-700 font-semibold tabular-nums">
                        +13.2 kg CO2e · +280 pts
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setCategoryFilter('informal_recycler');
                        setActiveTab('map');
                      }}
                      className="w-full flex items-center justify-between px-3.5 py-2 text-xs font-medium text-slate-700 border border-slate-300 hover:bg-slate-50 rounded-md transition-colors cursor-pointer"
                    >
                      <span>Locate Informal Co-op Hubs on Map</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* 3. Rooftop Solar & EV Demand-Response Nudges */}
                <div className="bg-white border border-slate-200 rounded-lg p-6 flex flex-col justify-between space-y-5">
                  <div className="space-y-2">
                    <div className="text-xs text-slate-500">
                      <span>Clean Feeder Generation</span>
                      <span aria-hidden="true"> · </span>
                      <span>Smart Inverter Telemetry</span>
                    </div>
                    <h2 className="text-lg font-bold text-slate-900">
                      03. Rooftop Solar & EV Nudges
                    </h2>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      Cut urban fossil peaker plant burn by exporting midday rooftop solar surplus to neighborhood feeders and shifting EV charging to peak solar hours (10:00–15:00).
                    </p>
                  </div>

                  <div className="space-y-2 pt-4 border-t border-slate-200">
                    <button
                      type="button"
                      onClick={() =>
                        recordImpactAction({
                          category: 'rooftop_solar',
                          metricValue: 18.0,
                          title: '18 kWh Rooftop Solar Net-Metering Feeder Export',
                          hubName: 'Castro Community Solar Microgrid #1',
                        })
                      }
                      className="w-full flex items-center justify-between px-3.5 py-2 text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-900 rounded-md transition-colors cursor-pointer"
                    >
                      <span>Sync 18 kWh Rooftop Solar Export</span>
                      <span className="font-mono text-emerald-700 font-semibold tabular-nums">
                        +7.56 kg CO2e · +216 pts
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        recordImpactAction({
                          category: 'ev_nudge',
                          metricValue: 22.0,
                          title: '22 kWh Midday Solar-Window EV Smart Charge',
                          hubName: 'Civic Solar-Sync EV & Park-Ride #1',
                        })
                      }
                      className="w-full flex items-center justify-between px-3.5 py-2 text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-900 rounded-md transition-colors cursor-pointer"
                    >
                      <span>Log 22 kWh Midday Solar EV Nudge</span>
                      <span className="font-mono text-emerald-700 font-semibold tabular-nums">
                        +12.76 kg CO2e · +352 pts
                      </span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Verified Activity Ledger Table */}
              <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">
                      Recent Verified Circularity & Clean Energy Ledger
                    </h3>
                    <p className="text-xs text-slate-500">
                      Immutable audit trail of your segregated waste, solar exports, and car-free trips.
                    </p>
                  </div>
                  <span className="text-xs font-mono tabular-nums text-slate-500">
                    {activityLogs.length} verified entries
                  </span>
                </div>

                {activityLogs.length === 0 ? (
                  <div className="p-8 text-center space-y-3">
                    <p className="text-xs text-slate-500">
                      No sustainability actions recorded yet. Log your first segregation or transit entry to start earning EcoCredits.
                    </p>
                    <button
                      type="button"
                      onClick={() => setActiveTab('map')}
                      className="px-4 py-2 text-xs font-semibold bg-emerald-700 text-white rounded-md cursor-pointer"
                    >
                      Log First Entry
                    </button>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-semibold">
                          <th className="py-3 px-4">Action Summary</th>
                          <th className="py-3 px-4">Domain</th>
                          <th className="py-3 px-4">Facility / Hub</th>
                          <th className="py-3 px-4">Verification</th>
                          <th className="py-3 px-4 text-right">Quantity</th>
                          <th className="py-3 px-4 text-right">CO2e Saved</th>
                          <th className="py-3 px-4 text-right">EcoCredits</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 text-slate-700">
                        {activityLogs.map((log) => (
                          <tr key={log.id} className="hover:bg-slate-50">
                            <td className="py-3 px-4 font-medium text-slate-900">{log.title}</td>
                            <td className="py-3 px-4 text-slate-600">
                              {CATEGORY_META[log.category]?.shortLabel || log.category}
                            </td>
                            <td className="py-3 px-4 text-slate-600">{log.hubName}</td>
                            <td className="py-3 px-4 text-slate-500">{log.verifiedMethod}</td>
                            <td className="py-3 px-4 text-right font-mono tabular-nums">
                              {log.metricValue.toFixed(1)} {log.metricUnit}
                            </td>
                            <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-slate-900">
                              {log.carbonSavedKg.toFixed(2)} kg
                            </td>
                            <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-emerald-700">
                              +{log.pointsEarned}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* TAB 3: PUBLIC TRANSIT, BIKE-SHARING & EV ROUTE NUDGE VERIFIER */}
          {activeTab === 'transit' && (
            <section className="space-y-8">
              <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-6">
                <div className="border-b border-slate-200 pb-4">
                  <div className="text-xs text-slate-500">
                    <span>Google Maps Platform Routes API Integration</span>
                    <span aria-hidden="true"> · </span>
                    <span>Active Travel & Public Transit Verification</span>
                  </div>
                  <h2 className="text-xl font-bold text-slate-900 mt-1">
                    Nudge Out of Cars: Multimodal Commute & Carbon Verifier
                  </h2>
                  <p className="text-xs text-slate-600 mt-1 max-w-3xl">
                    Verify real-world public transit, protected bike-share, or walking routes against single-occupancy car baselines using the Google Maps Routes API, then claim your verified EcoCredits.
                  </p>
                </div>

                {/* Preset Municipal Corridors */}
                <div className="space-y-3">
                  <div className="text-xs font-semibold text-slate-700">
                    Select a Municipal Active Travel Corridor or Enter Custom Origin/Destination:
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {MUNICIPAL_CORRIDORS.map((corridor) => (
                      <button
                        key={corridor.id}
                        type="button"
                        onClick={() => {
                          setRouteOrigin(corridor.origin);
                          setRouteDestination(corridor.destination);
                          setRouteMode(corridor.recommendedMode);
                          setRouteTrigger((x) => x + 1);
                        }}
                        className="text-left p-3.5 border border-slate-200 rounded-lg hover:border-slate-400 bg-slate-50/60 transition-colors cursor-pointer space-y-1"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-slate-900">
                            {corridor.title}
                          </span>
                          <span className="text-[11px] font-mono text-emerald-700 font-semibold whitespace-nowrap">
                            {corridor.recommendedMode}
                          </span>
                        </div>
                        <div className="text-xs text-slate-500">
                          <span>{corridor.transitAgency}</span>
                          <span aria-hidden="true"> · </span>
                          <span>{corridor.nudgeHighlight}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Custom Route Calculation Form */}
                <div className="grid grid-cols-1 md:grid-cols-12 gap-4 pt-2 items-end">
                  <div className="md:col-span-4">
                    <label
                      htmlFor="route-origin-input"
                      className="block text-xs font-medium text-slate-700 mb-1"
                    >
                      Origin Station or Address
                    </label>
                    <input
                      id="route-origin-input"
                      type="text"
                      value={routeOrigin}
                      onChange={(e) => setRouteOrigin(e.target.value)}
                      className="w-full text-xs border border-slate-300 rounded-md px-3 py-2 bg-white text-slate-900"
                    />
                  </div>
                  <div className="md:col-span-4">
                    <label
                      htmlFor="route-dest-input"
                      className="block text-xs font-medium text-slate-700 mb-1"
                    >
                      Destination Station or Address
                    </label>
                    <input
                      id="route-dest-input"
                      type="text"
                      value={routeDestination}
                      onChange={(e) => setRouteDestination(e.target.value)}
                      className="w-full text-xs border border-slate-300 rounded-md px-3 py-2 bg-white text-slate-900"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label
                      htmlFor="route-mode-select"
                      className="block text-xs font-medium text-slate-700 mb-1"
                    >
                      Travel Mode
                    </label>
                    <select
                      id="route-mode-select"
                      value={routeMode}
                      onChange={(e) =>
                        setRouteMode(
                          e.target.value as 'BICYCLING' | 'TRANSIT' | 'WALKING' | 'DRIVING'
                        )
                      }
                      className="w-full text-xs border border-slate-300 rounded-md px-3 py-2 bg-white text-slate-900"
                    >
                      <option value="TRANSIT">Public Transit</option>
                      <option value="BICYCLING">Bike-Sharing</option>
                      <option value="WALKING">Active Walking</option>
                      <option value="DRIVING">EV Pool (Baseline)</option>
                    </select>
                  </div>
                  <div className="md:col-span-2">
                    <button
                      type="button"
                      onClick={() => setRouteTrigger((x) => x + 1)}
                      className="w-full py-2 px-4 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-md transition-colors cursor-pointer whitespace-nowrap"
                    >
                      Verify Route
                    </button>
                  </div>
                </div>

                {routeError && (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-md text-xs text-amber-900">
                    {routeError}
                  </div>
                )}

                {computedRoute && (
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="space-y-1">
                      <div className="text-xs text-slate-500">
                        <span>Verified via Google Maps Routes API</span>
                        <span aria-hidden="true"> · </span>
                        <span>Mode: {computedRoute.travelMode}</span>
                      </div>
                      <div className="text-sm font-bold text-slate-900 font-mono tabular-nums">
                        {computedRoute.distanceKm} km · {computedRoute.durationMins} mins · Avoids{' '}
                        {computedRoute.carbonSavedKg} kg CO2e vs. solo car
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        recordImpactAction({
                          category: 'active_transit',
                          metricValue: computedRoute.distanceKm,
                          title: `Verified ${computedRoute.travelMode} Commute (${computedRoute.distanceKm} km)`,
                          hubName: `${computedRoute.origin.split(',')[0]} → ${
                            computedRoute.destination.split(',')[0]
                          }`,
                          verifiedMethod: 'Google Maps Routes API + AWS Lambda Verifier',
                        })
                      }
                      className="px-4 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0"
                    >
                      Claim +{computedRoute.ecoPointsAwarded} EcoCredits
                    </button>
                  </div>
                )}

                {/* Embedded Map showing the active route polyline + transit/bike hubs */}
                <UrbanClusterMap
                  filteredGeojson={filteredGeojson}
                  selectedNode={selectedNode}
                  onSelectNode={handleSelectNode}
                  onSelectClusterLeaves={handleSelectClusterLeaves}
                  onClusterStatsChange={handleClusterStatsChange}
                  routeOrigin={routeOrigin}
                  routeDestination={routeDestination}
                  routeMode={routeMode}
                  routeTrigger={routeTrigger}
                  onRouteComputed={handleRouteComputed}
                />
              </div>
            </section>
          )}

          {/* TAB 4: GAMIFIED LEADERBOARD & LOCAL REWARDS MARKETPLACE */}
          {activeTab === 'rewards' && (
            <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              {/* Left 7 Columns: Local Rewards Marketplace */}
              <div className="lg:col-span-7 space-y-6">
                <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-5">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-4">
                    <div>
                      <h2 className="text-lg font-bold text-slate-900">
                        Local Municipal & Circular Rewards Catalog
                      </h2>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Redeem your verified EcoCredits for transit passes, bike-share minutes, solar bill offsets, and compost vouchers.
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="text-xs text-slate-500">Available Balance</span>
                      <div className="text-lg font-bold font-mono tabular-nums text-emerald-700">
                        {profile.ecoPoints.toLocaleString()} pts
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {REWARDS_CATALOG.map((item) => {
                      const canAfford = profile.ecoPoints >= item.pointsCost;
                      return (
                        <div
                          key={item.id}
                          className="border border-slate-200 rounded-lg p-4 flex flex-col justify-between space-y-4"
                        >
                          <div className="space-y-1.5">
                            <div className="text-xs text-slate-500">
                              <span>{item.category}</span>
                              <span aria-hidden="true"> · </span>
                              <span>{item.partnerName}</span>
                            </div>
                            <h3 className="text-sm font-semibold text-slate-900">{item.title}</h3>
                            <p className="text-xs text-slate-600 leading-relaxed">
                              {item.description}
                            </p>
                          </div>

                          <div className="pt-3 border-t border-slate-200 flex items-center justify-between gap-2">
                            <span className="font-mono text-xs font-bold tabular-nums text-slate-900">
                              {item.pointsCost} EcoCredits
                            </span>
                            <button
                              type="button"
                              disabled={!canAfford}
                              onClick={() => handleRedeemReward(item.id)}
                              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                                canAfford
                                  ? 'bg-emerald-700 text-white hover:bg-emerald-800'
                                  : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                              }`}
                            >
                              {canAfford ? 'Redeem Reward' : 'Need More Credits'}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* User's Redeemed Vouchers */}
                <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                  <div className="px-6 py-4 border-b border-slate-200">
                    <h3 className="text-sm font-semibold text-slate-900">
                      Your Redeemed Municipal Vouchers ({redemptions.length})
                    </h3>
                  </div>
                  {redemptions.length === 0 ? (
                    <div className="p-6 text-xs text-slate-500">
                      No vouchers redeemed yet. Select any reward above to generate an instant municipal voucher code.
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-200">
                      {redemptions.map((r) => (
                        <div
                          key={r.id}
                          className="px-6 py-3.5 flex items-center justify-between gap-4 text-xs"
                        >
                          <div>
                            <div className="font-semibold text-slate-900">{r.rewardTitle}</div>
                            <div className="text-slate-500 mt-0.5">
                              <span>{r.partnerName}</span>
                              <span aria-hidden="true"> · </span>
                              <span className="font-mono font-semibold text-slate-800">
                                Code: {r.voucherCode}
                              </span>
                              <span aria-hidden="true"> · </span>
                              <span>Status: {r.status === 'active' ? 'Active' : 'Used'}</span>
                            </div>
                          </div>
                          {r.status === 'active' && (
                            <button
                              type="button"
                              onClick={() => handleMarkVoucherUsed(r)}
                              className="px-3 py-1 text-xs font-medium border border-slate-300 rounded hover:bg-slate-100 cursor-pointer whitespace-nowrap"
                            >
                              Mark Used
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Right 5 Columns: Live City-Wide Carbon Leaderboard */}
              <div className="lg:col-span-5 bg-white border border-slate-200 rounded-lg overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-200">
                  <h2 className="text-base font-bold text-slate-900">
                    City-Wide Carbon Impact Leaderboard
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Ranked by verified CO2e avoided across waste segregation, solar export, and car-free transit.
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-semibold">
                        <th className="py-3 px-4">Rank</th>
                        <th className="py-3 px-4">Participant</th>
                        <th className="py-3 px-4 text-right">CO2e Saved</th>
                        <th className="py-3 px-4 text-right">EcoCredits</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 text-slate-700">
                      {combinedLeaderboard.map((entry, idx) => {
                        const isSelf = entry.uid === profile.uid;
                        return (
                          <tr
                            key={entry.uid}
                            className={isSelf ? 'bg-emerald-50/70 font-semibold' : 'hover:bg-slate-50'}
                          >
                            <td className="py-3 px-4 font-mono tabular-nums text-slate-900">
                              #{idx + 1}
                            </td>
                            <td className="py-3 px-4">
                              <div className="text-slate-900">
                                {entry.displayName} {isSelf ? '(You)' : ''}
                              </div>
                              <div className="text-[11px] text-slate-500 font-normal">
                                <span>{entry.neighborhood}</span>
                                <span aria-hidden="true"> · </span>
                                <span>{entry.streakDays}d streak</span>
                              </div>
                            </td>
                            <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-900">
                              {entry.totalCarbonSavedKg.toFixed(1)} kg
                            </td>
                            <td className="py-3 px-4 text-right font-mono tabular-nums text-emerald-700">
                              {entry.ecoPoints.toLocaleString()}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          )}
        </main>

        {/* Quiet Footer */}
        <footer className="border-t border-slate-200 bg-white px-6 py-5 mt-12">
          <div className="max-w-[1400px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
            <div>
              <span>VerdiLoop Urban Circularity & Active Mobility Platform</span>
              <span aria-hidden="true"> · </span>
              <span>
                Built on AWS Serverless (Amazon Cognito, AWS AppSync, Amazon DynamoDB, AWS IoT Core) & Google Maps Platform
              </span>
            </div>
            <div className="flex items-center gap-4">
              <a
                href="https://cloud.google.com/maps-platform/terms?utm_campaign=gmp_mcp_codeassist_v1_aistudio"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-slate-900 underline"
              >
                Google Maps Platform Terms
              </a>
              <span aria-hidden="true">·</span>
              <a
                href="https://policies.google.com/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-slate-900 underline"
              >
                Privacy Policy
              </a>
            </div>
          </div>
        </footer>
      </div>
    </APIProvider>
  );
}
