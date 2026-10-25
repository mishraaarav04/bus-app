import React, { useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { api } from "../api/client";
import { colors, font, radius } from "../theme";
import { ErrorText, Field } from "./ui";
import type { PlaceResult } from "../types";

/** Address search (Mapbox Geocoding via the server). Tap a result to pick it. */
export function PlaceSearch({
  label,
  placeholder,
  near,
  onPick,
}: {
  label?: string;
  placeholder?: string;
  near?: { lat: number; lng: number };
  onPick: (p: PlaceResult) => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    if (q.trim().length < 3) {
      setResults([]);
      return;
    }
    const mine = ++seq.current;
    const t = setTimeout(async () => {
      try {
        const r = await api.search(q.trim(), near);
        if (mine === seq.current) {
          setResults(r);
          setError(null);
        }
      } catch (e: any) {
        if (mine === seq.current) setError(e.message);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [q, near?.lat, near?.lng]);

  return (
    <View style={{ gap: 8 }}>
      <Field label={label} value={q} onChangeText={setQ} placeholder={placeholder ?? "Search an address"} autoCorrect={false} />
      <ErrorText text={error} />
      {results.map((r) => (
        <Pressable
          key={r.id}
          onPress={() => {
            onPick(r);
            setQ("");
            setResults([]);
          }}
          style={{
            padding: 12,
            borderRadius: radius.md,
            backgroundColor: colors.primarySoft,
          }}
        >
          <Text style={font.h3}>{r.name}</Text>
          <Text style={font.small}>{r.address}</Text>
        </Pressable>
      ))}
    </View>
  );
}
