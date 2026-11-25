import type { MultiPolygon } from "geojson";

/** A square of roughly `sideM` metres at a given lon/lat (south-west corner). */
export function square(lng: number, lat: number, sideM: number): MultiPolygon {
  const dLat = sideM / 111_320;
  const dLng = sideM / (111_320 * Math.cos((lat * Math.PI) / 180));
  return {
    type: "MultiPolygon",
    coordinates: [[[[lng, lat], [lng + dLng, lat], [lng + dLng, lat + dLat], [lng, lat + dLat], [lng, lat]]]],
  };
}

export const KML = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>Kiabukwa bamboo</name>
<Folder><name>Block A</name>
<Placemark><name>KBK-B-001</name><ExtendedData><Data name="species"><value>Bambusa vulgaris</value></Data></ExtendedData>
<Polygon><outerBoundaryIs><LinearRing><coordinates>
25.0,-8.0,0 25.00907,-8.0,0 25.00907,-7.991,0 25.0,-7.991,0 25.0,-8.0,0
</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>
<Placemark><name>Nursery gate</name><Point><coordinates>25.01,-8.0,0</coordinates></Point></Placemark>
<Placemark><name>Tiny</name><Polygon><outerBoundaryIs><LinearRing><coordinates>
25.1,-8.0 25.1001,-8.0 25.1001,-7.9999 25.1,-8.0
</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>
</Folder></Document></kml>`;
