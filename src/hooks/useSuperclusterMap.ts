import { useMap } from '@vis.gl/react-google-maps';
import { useCallback, useEffect, useMemo, useReducer, useState } from 'react';
import Supercluster, { ClusterProperties } from 'supercluster';
import { GeoJSONFeatureCollection, UrbanNodeProperties } from '../data/urbanNodes';

export type BBoxTuple = [number, number, number, number]; // [west, south, east, north]

function degreesPerPixel(zoomLevel: number): number {
  return 360 / (Math.pow(2, zoomLevel) * 256);
}

export function useMapViewport({ padding = 80 }: { padding?: number } = {}) {
  const map = useMap();
  // Default to San Francisco metropolitan bounding box so clusters render immediately
  const [bbox, setBbox] = useState<BBoxTuple>([-122.54, 37.70, -122.34, 37.84]);
  const [zoom, setZoom] = useState<number>(12);

  useEffect(() => {
    if (!map) return;

    const updateViewport = () => {
      const bounds = map.getBounds();
      const currentZoom = map.getZoom();
      if (!bounds || currentZoom === undefined) return;

      const sw = bounds.getSouthWest();
      const ne = bounds.getNorthEast();
      const paddingDegrees = degreesPerPixel(currentZoom) * padding;

      const n = Math.min(90, ne.lat() + paddingDegrees);
      const s = Math.max(-90, sw.lat() - paddingDegrees);
      const w = sw.lng() - paddingDegrees;
      const e = ne.lng() + paddingDegrees;

      setBbox([w, s, e, n]);
      setZoom(Math.round(currentZoom));
    };

    updateViewport();
    const listener = map.addListener('idle', updateViewport);
    return () => listener.remove();
  }, [map, padding]);

  return { bbox, zoom, map };
}

export function useSuperclusterMap(
  geojson: GeoJSONFeatureCollection,
  options: Supercluster.Options<UrbanNodeProperties, ClusterProperties>
) {
  const clusterer = useMemo(() => {
    return new Supercluster<UrbanNodeProperties, ClusterProperties>(options);
  }, [options]);

  const [version, notifyDataUpdated] = useReducer((x: number) => x + 1, 0);

  useEffect(() => {
    clusterer.load(geojson.features as any);
    notifyDataUpdated();
  }, [clusterer, geojson]);

  const { bbox, zoom, map } = useMapViewport({ padding: 90 });

  const clusters = useMemo(() => {
    if (!clusterer || version === 0) return [];
    try {
      return clusterer.getClusters(bbox, zoom);
    } catch {
      return [];
    }
  }, [version, clusterer, bbox, zoom]);

  const getLeaves = useCallback(
    (clusterId: number) => {
      try {
        return clusterer.getLeaves(clusterId, Infinity);
      } catch {
        return [];
      }
    },
    [clusterer]
  );

  const getClusterExpansionZoom = useCallback(
    (clusterId: number) => {
      try {
        return clusterer.getClusterExpansionZoom(clusterId);
      } catch {
        return zoom + 2;
      }
    },
    [clusterer, zoom]
  );

  return {
    clusters,
    zoom,
    map,
    getLeaves,
    getClusterExpansionZoom,
  };
}
