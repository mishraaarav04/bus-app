import React, { useEffect, useMemo, useRef } from "react";
import { StyleSheet, Text, View } from "react-native";
import { WebView } from "react-native-webview";
import { colors, font } from "../theme";
import { useMapConfig } from "../hooks/useMapConfig";

export interface MapMarker {
  id: string;
  lat: number;
  lng: number;
  kind: "stop" | "school" | "bus" | "me";
  label?: string; // number or short text shown in the pin
  tone?: "orange" | "green" | "gray" | "red";
}

export interface MapState {
  markers: MapMarker[];
  line?: [number, number][] | null; // [lng, lat]
  fitKey?: string; // change to re-fit the camera to everything
  bottomPadding?: number;
}

// Mapbox GL JS runs inside a WebView so it works in Expo Go (native Mapbox
// needs a custom dev build). The page is static; we push state into it.
const GL_VERSION = "3.33.0";

function buildHtml(token: string) {
  return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<link href="https://api.mapbox.com/mapbox-gl-js/v${GL_VERSION}/mapbox-gl.css" rel="stylesheet">
<script src="https://api.mapbox.com/mapbox-gl-js/v${GL_VERSION}/mapbox-gl.js"></script>
<style>
html,body,#map{margin:0;padding:0;height:100%;width:100%;background:#FFF4EA}
.pin{width:34px;height:34px;border-radius:50%;border:3px solid #fff;box-shadow:0 3px 10px rgba(122,58,0,.35);
 display:flex;align-items:center;justify-content:center;color:#fff;font:800 14px -apple-system,Roboto,sans-serif}
.orange{background:#FF7A1A}.green{background:#1FA35C}.gray{background:#8C7B6E}.red{background:#E5484D}
.school{background:#231A14}
.bus{width:46px;height:46px;font-size:22px;background:#FF7A1A;box-shadow:0 0 0 8px rgba(255,122,26,.25),0 3px 10px rgba(122,58,0,.4)}
.me{width:20px;height:20px;background:#2F80ED;box-shadow:0 0 0 8px rgba(47,128,237,.22)}
</style></head><body><div id="map"></div>
<script>
mapboxgl.accessToken=${JSON.stringify(token)};
const map=new mapboxgl.Map({container:'map',style:'mapbox://styles/mapbox/streets-v12',center:[-74.17,40.73],zoom:11,attributionControl:true});
let ready=false,pending=null,markers={},lastFit=null;
function el(m){
  const d=document.createElement('div');
  if(m.kind==='bus'){d.className='pin bus';d.textContent='\\u{1F68C}';}
  else if(m.kind==='school'){d.className='pin school';d.textContent='\\u{1F3EB}';}
  else if(m.kind==='me'){d.className='pin me';}
  else{d.className='pin '+(m.tone||'orange');d.textContent=m.label||'';}
  return d;
}
function apply(s){
  const seen={};
  (s.markers||[]).forEach(m=>{
    seen[m.id]=1;
    const cur=markers[m.id];
    if(cur&&cur.kind===m.kind&&cur.tone===m.tone&&cur.label===m.label){cur.marker.setLngLat([m.lng,m.lat]);}
    else{
      if(cur)cur.marker.remove();
      const marker=new mapboxgl.Marker({element:el(m)}).setLngLat([m.lng,m.lat]).addTo(map);
      markers[m.id]={marker,kind:m.kind,tone:m.tone,label:m.label};
    }
  });
  Object.keys(markers).forEach(id=>{if(!seen[id]){markers[id].marker.remove();delete markers[id];}});
  const line=s.line&&s.line.length>1?{type:'Feature',geometry:{type:'LineString',coordinates:s.line}}:null;
  const data={type:'FeatureCollection',features:line?[line]:[]};
  if(map.getSource('route'))map.getSource('route').setData(data);
  else{
    map.addSource('route',{type:'geojson',data});
    map.addLayer({id:'route-casing',type:'line',source:'route',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#fff','line-width':10}});
    map.addLayer({id:'route',type:'line',source:'route',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#FF7A1A','line-width':6}});
  }
  if(s.fitKey&&s.fitKey!==lastFit){
    lastFit=s.fitKey;
    const b=new mapboxgl.LngLatBounds();
    (s.markers||[]).forEach(m=>b.extend([m.lng,m.lat]));
    if(line)s.line.forEach(c=>b.extend(c));
    if(!b.isEmpty()){
      map.fitBounds(b,{padding:{top:90,left:50,right:50,bottom:(s.bottomPadding||200)+40},maxZoom:16,duration:600});
    }
  }
}
window.updateMap=function(s){ if(!ready){pending=s;return;} apply(s); };
map.on('load',()=>{ready=true;if(pending){apply(pending);pending=null;}});
</script></body></html>`;
}

export function WheelieMap({ state, style }: { state: MapState; style?: object }) {
  const { config, loading } = useMapConfig();
  const ref = useRef<WebView>(null);
  const loaded = useRef(false);
  const html = useMemo(() => (config?.token ? buildHtml(config.token) : null), [config?.token]);

  const push = () => {
    if (!loaded.current) return;
    ref.current?.injectJavaScript(`window.updateMap(${JSON.stringify(state)});true;`);
  };
  useEffect(push, [state]);

  if (loading) return <View style={[styles.fallback, style]} />;
  if (!html) {
    return (
      <View style={[styles.fallback, style]}>
        <Text style={font.h3}>Map needs a Mapbox token</Text>
        <Text style={[font.small, { textAlign: "center", marginTop: 6 }]}>
          Add MAPBOX_TOKEN to server/.env and restart the server. Everything else still works.
        </Text>
      </View>
    );
  }
  return (
    <WebView
      ref={ref}
      style={[styles.map, style]}
      originWhitelist={["*"]}
      source={{ html, baseUrl: "https://localhost" }}
      javaScriptEnabled
      domStorageEnabled
      onLoadEnd={() => {
        loaded.current = true;
        push();
      }}
      bounces={false}
      overScrollMode="never"
      setSupportMultipleWindows={false}
    />
  );
}

const styles = StyleSheet.create({
  map: { flex: 1, backgroundColor: "#FFF4EA" },
  fallback: {
    flex: 1,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
  },
});
