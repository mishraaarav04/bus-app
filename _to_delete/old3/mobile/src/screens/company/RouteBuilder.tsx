import React, { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../../api/client";
import { PlaceSearch } from "../../components/PlaceSearch";
import { Button, Card, ErrorText, Field, Pill, Row } from "../../components/ui";
import { colors, font, ftToM, lbToT, mToFt, tToLb } from "../../theme";
import { CompanyOverview, Route } from "../../types";
import { RoutePreview } from "./RoutePreview";

interface DraftStop {
  key: string;
  name: string;
  lat: number;
  lng: number;
}

/**
 * The whole point for bus companies: pick a school, add stops, and RouteIQ
 * builds the fastest route that fits the bus. No ordering by hand.
 */
export function RouteBuilder({
  overview,
  onClose,
  onChanged,
}: {
  overview: CompanyOverview;
  onClose: () => void;
  onChanged: () => void;
}) {
  const spec = overview.busSpec ?? { heightM: 3.4, widthM: 2.6, weightT: 14 };
  const [name, setName] = useState("");
  const [schoolId, setSchoolId] = useState<string | null>(overview.schools[0]?.id ?? null);
  const [direction, setDirection] = useState<"to_school" | "to_home">("to_school");
  const [heightFt, setHeightFt] = useState(String(mToFt(spec.heightM)));
  const [widthFt, setWidthFt] = useState(String(mToFt(spec.widthM)));
  const [weightLb, setWeightLb] = useState(String(tToLb(spec.weightT)));
  const [startTime, setStartTime] = useState("");
  const [stops, setStops] = useState<DraftStop[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [built, setBuilt] = useState<Route | null>(null);

  const school = overview.schools.find((s) => s.id === schoolId);

  async function build() {
    if (!schoolId) return;
    setError(null);
    const h = parseFloat(heightFt);
    const w = parseFloat(widthFt);
    const lb = parseFloat(weightLb);
    if (!(h > 0) || !(w > 0) || !(lb > 0)) return setError("Enter your bus height, width and weight.");
    if (startTime.trim() && !/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime.trim())) {
      return setError("Start time should look like 07:15 (24-hour).");
    }
    setBusy(true);
    try {
      const route = await api.createRoute({
        name: name.trim(),
        schoolId,
        direction,
        vehicle: { heightM: ftToM(h), widthM: ftToM(w), weightT: lbToT(lb) },
        startTime: startTime.trim() || undefined,
        stops: stops.map((s) => ({ name: s.name, location: { lat: s.lat, lng: s.lng } })),
      });
      setBuilt(route);
      onChanged();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    if (!built) return;
    setBusy(true);
    try {
      const sent = await api.sendRoute(built.id);
      setBuilt(sent);
      onChanged();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (built) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.white }}>
        <ScrollView contentContainerStyle={{ padding: 20, gap: 14 }}>
          <Text style={font.title}>{built.name}</Text>
          <RoutePreview route={built} height={320} />
          <Text style={font.h3}>Stop order</Text>
          {built.stops.map((s) => (
            <Row key={s.id}>
              <Pill text={String(s.order + 1)} tone="orange" />
              <Text style={font.body}>{s.name}</Text>
            </Row>
          ))}
          <ErrorText text={error} />
          {built.status !== "sent" ? (
            <Button title={`Send to ${school?.name ?? "school"}`} onPress={send} loading={busy} />
          ) : (
            <Text style={{ color: colors.success, fontWeight: "800" }}>
              Sent. {school?.name} can now see this route and assign students.
            </Text>
          )}
          <Button title="Done" variant="soft" onPress={onClose} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  const canBuild = name.trim() && schoolId && stops.length >= 1;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.white }}>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 14 }} keyboardShouldPersistTaps="handled">
        <Row style={{ justifyContent: "space-between" }}>
          <Text style={font.title}>New route</Text>
          <Pressable onPress={onClose} hitSlop={12}>
            <Ionicons name="close" size={28} color={colors.ink} />
          </Pressable>
        </Row>

        <Field label="Route name" value={name} onChangeText={setName} placeholder="Morning run - North" />
        <Field
          label="Usual start time (optional)"
          value={startTime}
          onChangeText={setStartTime}
          placeholder="07:15"
          keyboardType="numbers-and-punctuation"
          maxLength={5}
        />
        <Text style={font.small}>Used to flag runs that start late in Reports.</Text>

        <Text style={font.h3}>School</Text>
        {overview.schools.length === 0 ? (
          <Text style={font.small}>Add a school in the Team tab first.</Text>
        ) : (
          <Row style={{ flexWrap: "wrap" }}>
            {overview.schools.map((s) => (
              <Pressable key={s.id} onPress={() => setSchoolId(s.id)}>
                <Pill text={s.name} tone={s.id === schoolId ? "orange" : "gray"} />
              </Pressable>
            ))}
          </Row>
        )}

        <Row>
          {(["to_school", "to_home"] as const).map((d) => (
            <Pressable key={d} style={{ flex: 1 }} onPress={() => setDirection(d)}>
              <View
                style={{
                  padding: 12,
                  borderRadius: 16,
                  alignItems: "center",
                  backgroundColor: direction === d ? colors.primary : colors.primarySoft,
                }}
              >
                <Text style={{ fontWeight: "800", color: direction === d ? colors.white : colors.primaryDark }}>
                  {d === "to_school" ? "To school" : "To home"}
                </Text>
              </View>
            </Pressable>
          ))}
        </Row>

        <Text style={font.h3}>Bus size</Text>
        <Text style={font.small}>Used so the route avoids roads that are too low, narrow or weight-limited.</Text>
        <Row>
          <View style={{ flex: 1 }}>
            <Field label="Height (ft)" value={heightFt} onChangeText={setHeightFt} keyboardType="decimal-pad" />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Width (ft)" value={widthFt} onChangeText={setWidthFt} keyboardType="decimal-pad" />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Weight (lb)" value={weightLb} onChangeText={setWeightLb} keyboardType="number-pad" />
          </View>
        </Row>

        <Text style={font.h3}>Stops ({stops.length}/11)</Text>
        {stops.map((s, i) => (
          <Card key={s.key}>
            <Row>
              <Pill text={String(i + 1)} tone="orange" />
              <Text style={[font.body, { flex: 1 }]}>{s.name}</Text>
              <Pressable onPress={() => setStops((prev) => prev.filter((x) => x.key !== s.key))} hitSlop={10}>
                <Ionicons name="trash-outline" size={22} color={colors.danger} />
              </Pressable>
            </Row>
          </Card>
        ))}
        {stops.length < 11 ? (
          <PlaceSearch
            placeholder="Search a stop address"
            near={school?.location}
            onPick={(p) =>
              setStops((prev) => [
                ...prev,
                { key: `${p.id}-${prev.length}`, name: p.name || p.address, lat: p.lat, lng: p.lng },
              ])
            }
          />
        ) : null}
        <Text style={font.small}>Add them in any order. RouteIQ orders them for the fastest drive.</Text>

        <ErrorText text={error} />
        <Button title="Build fastest route" onPress={build} loading={busy} disabled={!canBuild} />
      </ScrollView>
    </SafeAreaView>
  );
}
