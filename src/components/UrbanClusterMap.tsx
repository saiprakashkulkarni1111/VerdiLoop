import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AdvancedMarker,
  AdvancedMarkerAnchorPoint,
  InfoWindow,
  Map,
  useAdvancedMarkerRef,
  useMap,
  useMapsLibrary,
} from '@vis.gl/react-google-maps';
import { ClusterProperties } from 'supercluster';
import {
  CATEGORY_META,
  CircularCategory,
  GeoJSONFeatureCollection,
  UrbanNodeProperties,
} from '../data/urbanNodes';
import { useSuperclusterMap } from '../hooks/useSuperclusterMap';

export interface ActiveRouteResult {
  origin: string;
  destination: string;
  travelMode: 'BICYCLING' | 'TRANSIT' | 'WALKING' | 'DRIVING';
  distanceKm: number;
  durationMins: number;
  carbonSavedKg: number;
  ecoPointsAwarded: number;
}

interface ClusterMarkerItemProps {
  clusterId: number;
  position: google.maps.LatLngLiteral;
  pointCount: number;
  dominantColor: string;
  isSelected: boolean;
  onClusterSelect: (
    marker: google.maps.marker.AdvancedMarkerElement,
    clusterId: number,
    position: google.maps.LatLngLiteral
  ) => void;
}

const ClusterMarkerItem: React.FC<ClusterMarkerItemProps> = ({
  clusterId,
  position,
  pointCount,
  dominantColor,
  isSelected,
  onClusterSelect,
}) => {
  const [markerRef, marker] = useAdvancedMarkerRef();

  const handleClick = useCallback(() => {
    if (marker) {
      onClusterSelect(marker, clusterId, position);
    }
  }, [marker, onClusterSelect, clusterId, position]);

  const dimension = pointCount >= 25 ? 52 : pointCount >= 10 ? 44 : 38;

  return (
    <AdvancedMarker
      ref={markerRef}
      position={position}
      onClick={handleClick}
      anchorPoint={AdvancedMarkerAnchorPoint.CENTER}
      zIndex={100 + pointCount}
    >
      <button
        type="button"
        onClick={handleClick}
        aria-label={`Cluster of ${pointCount} urban sustainability nodes. Click to drill down.`}
        style={{
          width: `${dimension}px`,
          height: `${dimension}px`,
          backgroundColor: dominantColor,
        }}
        className={`flex flex-col items-center justify-center rounded-full text-white font-mono font-semibold shadow-md transition-transform duration-150 hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 cursor-pointer border-2 ${
          isSelected ? 'border-slate-950 scale-110 ring-4 ring-slate-900/20' : 'border-white'
        }`}
      >
        <span className="text-xs leading-none tabular-nums">{pointCount}</span>
        <span className="text-[9px] leading-none opacity-90 font-sans font-normal mt-0.5">
          nodes
        </span>
      </button>
    </AdvancedMarker>
  );
};

interface LeafMarkerItemProps {
  node: UrbanNodeProperties;
  position: google.maps.LatLngLiteral;
  isSelected: boolean;
  onNodeSelect: (
    marker: google.maps.marker.AdvancedMarkerElement,
    node: UrbanNodeProperties
  ) => void;
}

const LeafMarkerItem: React.FC<LeafMarkerItemProps> = ({
  node,
  position,
  isSelected,
  onNodeSelect,
}) => {
  const [markerRef, marker] = useAdvancedMarkerRef();
  const meta = CATEGORY_META[node.category];

  const handleClick = useCallback(() => {
    if (marker) {
      onNodeSelect(marker, node);
    }
  }, [marker, onNodeSelect, node]);

  return (
    <AdvancedMarker
      ref={markerRef}
      position={position}
      onClick={handleClick}
      anchorPoint={AdvancedMarkerAnchorPoint.CENTER}
      zIndex={isSelected ? 200 : 20}
    >
      <button
        type="button"
        onClick={handleClick}
        aria-label={`${node.name} (${meta.shortLabel})`}
        style={{
          backgroundColor: isSelected ? '#0f172a' : meta.colorHex,
        }}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-white text-xs font-medium shadow-sm border border-white transition-transform duration-150 hover:scale-105 cursor-pointer whitespace-nowrap"
      >
        <span className="font-mono text-[10px] opacity-90">{meta.unit}</span>
        <span>{meta.shortLabel}</span>
      </button>
    </AdvancedMarker>
  );
};

interface RouteOverlayControllerProps {
  origin: string;
  destination: string;
  travelMode: 'BICYCLING' | 'TRANSIT' | 'WALKING' | 'DRIVING';
  routeTrigger: number;
  onRouteComputed: (result: ActiveRouteResult | null, errorMsg: string | null) => void;
}

const RouteOverlayController: React.FC<RouteOverlayControllerProps> = ({
  origin,
  destination,
  travelMode,
  routeTrigger,
  onRouteComputed,
}) => {
  const map = useMap();
  const routesLib = useMapsLibrary('routes');
  const polylinesRef = useRef<google.maps.Polyline[]>([]);

  useEffect(() => {
    if (!routesLib || !map || !origin || !destination || routeTrigger === 0) return;

    // Clear previous polylines
    polylinesRef.current.forEach((p) => p.setMap(null));
    polylinesRef.current = [];

    const request = {
      origin,
      destination,
      travelMode,
      fields: ['path', 'distanceMeters', 'durationMillis', 'viewport'],
    };

    const RouteClass = (routesLib as any).Route;
    if (!RouteClass || typeof RouteClass.computeRoutes !== 'function') {
      onRouteComputed(null, 'Routes library is initializing. Please try again in a moment.');
      return;
    }

    RouteClass.computeRoutes(request)
      .then(({ routes }: { routes: any[] }) => {
        const primaryRoute = routes?.[0];
        if (!primaryRoute) {
          onRouteComputed(null, 'No transit or active travel route found between these points.');
          return;
        }

        const strokeColor =
          travelMode === 'BICYCLING'
            ? '#059669'
            : travelMode === 'TRANSIT'
            ? '#2563eb'
            : travelMode === 'WALKING'
            ? '#0d9488'
            : '#64748b';

        if (typeof primaryRoute.createPolylines === 'function') {
          const newPolylines = primaryRoute.createPolylines();
          newPolylines.forEach((polyline: google.maps.Polyline) => {
            polyline.setOptions({
              strokeColor,
              strokeWeight: 5,
              strokeOpacity: 0.9,
            });
            polyline.setMap(map);
          });
          polylinesRef.current = newPolylines;
        }

        if (primaryRoute.viewport) {
          map.fitBounds(primaryRoute.viewport);
        }

        const distanceKm = Number(((primaryRoute.distanceMeters ?? 0) / 1000).toFixed(2));
        const durationMins = Math.max(1, Math.round((primaryRoute.durationMillis ?? 0) / 60000));

        // Car baseline ~0.24 kg CO2e/km vs Transit (~0.03) or Bike/Walk (0.0)
        const modeFactor =
          travelMode === 'BICYCLING' || travelMode === 'WALKING'
            ? 0.24
            : travelMode === 'TRANSIT'
            ? 0.21
            : 0.04;
        const carbonSavedKg = Number(Math.max(0.1, distanceKm * modeFactor).toFixed(2));
        const ecoPointsAwarded = Math.max(10, Math.round(distanceKm * 15));

        onRouteComputed(
          {
            origin,
            destination,
            travelMode,
            distanceKm,
            durationMins,
            carbonSavedKg,
            ecoPointsAwarded,
          },
          null
        );
      })
      .catch((err: unknown) => {
        console.error('Error computing route via Routes API:', err);
        onRouteComputed(
          null,
          'Unable to compute route data. Please check your network or Google Maps API permissions.'
        );
      });

    return () => {
      polylinesRef.current.forEach((p) => p.setMap(null));
      polylinesRef.current = [];
    };
  }, [routesLib, map, origin, destination, travelMode, routeTrigger, onRouteComputed]);

  return null;
};

interface ClusteredLayerProps {
  geojson: GeoJSONFeatureCollection;
  selectedNode: UrbanNodeProperties | null;
  onSelectNode: (node: UrbanNodeProperties) => void;
  onSelectClusterLeaves: (
    clusterId: number,
    leaves: UrbanNodeProperties[],
    expansionZoom: number
  ) => void;
  onClusterStatsChange: (visibleClusters: number, totalNodes: number) => void;
}

const ClusteredLayer: React.FC<ClusteredLayerProps> = ({
  geojson,
  selectedNode,
  onSelectNode,
  onSelectClusterLeaves,
  onClusterStatsChange,
}) => {
  const superclusterOptions = useMemo(
    () => ({
      radius: 65,
      maxZoom: 16,
    }),
    []
  );

  const { clusters, map, getLeaves, getClusterExpansionZoom } = useSuperclusterMap(
    geojson,
    superclusterOptions
  );

  const [activeAnchor, setActiveAnchor] =
    useState<google.maps.marker.AdvancedMarkerElement | null>(null);
  const [selectedClusterId, setSelectedClusterId] = useState<number | null>(null);

  useEffect(() => {
    onClusterStatsChange(clusters.length, geojson.features.length);
  }, [clusters.length, geojson.features.length, onClusterStatsChange]);

  const handleClusterSelect = useCallback(
    (
      marker: google.maps.marker.AdvancedMarkerElement,
      clusterId: number,
      position: google.maps.LatLngLiteral
    ) => {
      setSelectedClusterId(clusterId);
      setActiveAnchor(null);
      const rawLeaves = getLeaves(clusterId);
      const leafNodes = rawLeaves.map((f: any) => f.properties as UrbanNodeProperties);
      const expansionZoom = getClusterExpansionZoom(clusterId);

      onSelectClusterLeaves(clusterId, leafNodes, expansionZoom);

      if (map) {
        map.panTo(position);
        map.setZoom(Math.min(expansionZoom, 17));
      }
    },
    [getLeaves, getClusterExpansionZoom, onSelectClusterLeaves, map]
  );

  const handleNodeSelect = useCallback(
    (marker: google.maps.marker.AdvancedMarkerElement, node: UrbanNodeProperties) => {
      setSelectedClusterId(null);
      setActiveAnchor(marker);
      onSelectNode(node);
    },
    [onSelectNode]
  );

  return (
    <>
      {clusters.map((feature: any) => {
        const [lng, lat] = feature.geometry.coordinates;
        const props = feature.properties as ClusterProperties & UrbanNodeProperties;
        const isCluster = Boolean(props.cluster);

        if (isCluster) {
          const clusterId = props.cluster_id!;
          const leaves = getLeaves(clusterId);
          const firstCategory: CircularCategory =
            (leaves[0]?.properties as UrbanNodeProperties | undefined)?.category || 'recycling';
          const dominantColor = CATEGORY_META[firstCategory]?.colorHex || '#0f172a';

          return (
            <ClusterMarkerItem
              key={`cluster_${clusterId}`}
              clusterId={clusterId}
              position={{ lat, lng }}
              pointCount={props.point_count || leaves.length}
              dominantColor={dominantColor}
              isSelected={selectedClusterId === clusterId}
              onClusterSelect={handleClusterSelect}
            />
          );
        }

        return (
          <LeafMarkerItem
            key={props.id}
            node={props}
            position={{ lat, lng }}
            isSelected={selectedNode?.id === props.id}
            onNodeSelect={handleNodeSelect}
          />
        );
      })}

      {activeAnchor && selectedNode && (
        <InfoWindow
          anchor={activeAnchor}
          onCloseClick={() => setActiveAnchor(null)}
          headerContent={
            <div className="font-semibold text-slate-900 text-xs pr-2">
              {selectedNode.name}
            </div>
          }
        >
          <div className="text-xs text-slate-700 space-y-1.5 max-w-[230px] pt-1">
            <div className="text-slate-500">
              <span>{CATEGORY_META[selectedNode.category].label}</span>
              <span aria-hidden="true"> · </span>
              <span>{selectedNode.district}</span>
            </div>
            <p className="text-slate-600">{selectedNode.address}</p>
            <div className="flex items-center justify-between pt-1 border-t border-slate-200 font-mono text-[11px] tabular-nums">
              <span>
                {selectedNode.carbonFactorKgPerUnit} kg CO2e/{selectedNode.unit}
              </span>
              <span className="font-semibold text-emerald-700">
                +{selectedNode.pointsPerUnit} pts/{selectedNode.unit}
              </span>
            </div>
          </div>
        </InfoWindow>
      )}
    </>
  );
};

interface UrbanClusterMapProps {
  filteredGeojson: GeoJSONFeatureCollection;
  selectedNode: UrbanNodeProperties | null;
  onSelectNode: (node: UrbanNodeProperties) => void;
  onSelectClusterLeaves: (
    clusterId: number,
    leaves: UrbanNodeProperties[],
    expansionZoom: number
  ) => void;
  onClusterStatsChange: (visibleClusters: number, totalNodes: number) => void;
  routeOrigin: string;
  routeDestination: string;
  routeMode: 'BICYCLING' | 'TRANSIT' | 'WALKING' | 'DRIVING';
  routeTrigger: number;
  onRouteComputed: (result: ActiveRouteResult | null, errorMsg: string | null) => void;
}

export const UrbanClusterMap: React.FC<UrbanClusterMapProps> = ({
  filteredGeojson,
  selectedNode,
  onSelectNode,
  onSelectClusterLeaves,
  onClusterStatsChange,
  routeOrigin,
  routeDestination,
  routeMode,
  routeTrigger,
  onRouteComputed,
}) => {
  return (
    <div className="w-full h-[540px] rounded-lg overflow-hidden border border-slate-200 bg-slate-100 relative">
      <Map
        mapId="DEMO_MAP_ID"
        defaultCenter={{ lat: 37.7749, lng: -122.4294 }}
        defaultZoom={12}
        gestureHandling="greedy"
        fullscreenControl={false}
        streetViewControl={false}
        mapTypeControl={false}
        className="w-full h-full"
        internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
      >
        <ClusteredLayer
          geojson={filteredGeojson}
          selectedNode={selectedNode}
          onSelectNode={onSelectNode}
          onSelectClusterLeaves={onSelectClusterLeaves}
          onClusterStatsChange={onClusterStatsChange}
        />
        <RouteOverlayController
          origin={routeOrigin}
          destination={routeDestination}
          travelMode={routeMode}
          routeTrigger={routeTrigger}
          onRouteComputed={onRouteComputed}
        />
      </Map>
    </div>
  );
};
