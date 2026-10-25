import React, { useCallback, useEffect, useState } from "react";
import { Modal, ScrollView, Share, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "../../api/client";
import { PlaceSearch } from "../../components/PlaceSearch";
import { Avatar, Button, Card, Empty, ErrorText, Field, Row } from "../../components/ui";
import { colors, font, ftToM, lbToT, mToFt, tToLb } from "../../theme";
import { CompanyOverview, PlaceResult } from "../../types";

function BusSizeCard({ overview, onSaved }: { overview: CompanyOverview; onSaved: () => void }) {
  const spec = overview.busSpec ?? { heightM: 3.4, widthM: 2.6, weightT: 14 };
  const [h, setH] = useState(String(mToFt(spec.heightM)));
  const [w, setW] = useState(String(mToFt(spec.widthM)));
  const [lb, setLb] = useState(String(tToLb(spec.weightT)));
  const [msg, setMsg] = useState<string | null>(null);

  async function save() {
    setMsg(null);
    try {
      await api.setBusSpec({ heightM: ftToM(parseFloat(h)), widthM: ftToM(parseFloat(w)), weightT: lbToT(parseFloat(lb)) });
      setMsg("Saved");
      onSaved();
    } catch (e: any) {
      setMsg(e.message);
    }
  }
  return (
    <Card>
      <Text style={font.h3}>Default bus size</Text>
      <Text style={font.small}>New routes start with these. Routes avoid roads that are too low, narrow or heavy-limited.</Text>
      <Row>
        <View style={{ flex: 1 }}><Field label="Height (ft)" value={h} onChangeText={setH} keyboardType="decimal-pad" /></View>
        <View style={{ flex: 1 }}><Field label="Width (ft)" value={w} onChangeText={setW} keyboardType="decimal-pad" /></View>
        <View style={{ flex: 1 }}><Field label="Weight (lb)" value={lb} onChangeText={setLb} keyboardType="number-pad" /></View>
      </Row>
      {msg ? <Text style={font.small}>{msg}</Text> : null}
      <Button title="Save" variant="soft" onPress={save} />
    </Card>
  );
}

function AddSchool({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [place, setPlace] = useState<PlaceResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function create() {
    if (!place) return;
    setBusy(true);
    setError(null);
    try {
      await api.createSchool({
        name: name.trim(),
        email: email.trim(),
        password,
        address: place.address || place.name,
        location: { lat: place.lat, lng: place.lng },
      });
      onCreated();
      onClose();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.white }}>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 14 }} keyboardShouldPersistTaps="handled">
        <Text style={font.title}>Add a school</Text>
        <Text style={font.small}>
          You create the school's sign-in. Give them the email and password; they can change the password in Account.
        </Text>
        <Field label="School name" value={name} onChangeText={setName} />
        <Field label="School email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
        <Field label="Temporary password" value={password} onChangeText={setPassword} autoCapitalize="none" />
        <Text style={font.small}>At least 8 characters with a letter and a number.</Text>
        {place ? (
          <Card>
            <Text style={font.h3}>{place.name}</Text>
            <Text style={font.small}>{place.address}</Text>
            <Button title="Change address" variant="outline" onPress={() => setPlace(null)} />
          </Card>
        ) : (
          <PlaceSearch label="School address" placeholder="Search the school's address" onPick={setPlace} />
        )}
        <ErrorText text={error} />
        <Button title="Create school account" onPress={create} loading={busy} disabled={!name.trim() || !email || !password || !place} />
        <Button title="Cancel" variant="soft" onPress={onClose} />
      </ScrollView>
    </SafeAreaView>
  );
}

export function CompanyTeamScreen() {
  const [overview, setOverview] = useState<CompanyOverview | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setOverview(await api.companyOverview());
    } catch (e: any) {
      setError(e.message);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }} edges={["top"]}>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 12 }}>
        <Text style={font.title}>Team</Text>
        <ErrorText text={error} />
        {overview ? (
          <>
            <Card>
              <Text style={font.h3}>Driver sign-up code</Text>
              <Text style={{ fontSize: 26, fontWeight: "900", letterSpacing: 2, color: colors.primaryDark }}>
                {overview.driverCode}
              </Text>
              <Button
                title="Share code"
                variant="soft"
                onPress={() => Share.share({ message: `Join our bus company on RouteIQ with code ${overview.driverCode}` })}
              />
            </Card>

            <BusSizeCard overview={overview} onSaved={load} />

            <Row style={{ justifyContent: "space-between", marginTop: 6 }}>
              <Text style={font.h2}>Schools</Text>
              <Button title="+ Add" variant="soft" style={{ minHeight: 40 }} onPress={() => setAdding(true)} />
            </Row>
            {overview.schools.length === 0 ? (
              <Empty title="No schools yet" hint="Add a school to start building routes for it." />
            ) : (
              overview.schools.map((s) => (
                <Card key={s.id}>
                  <Row>
                    <Avatar name={s.name} tone={colors.ink} />
                    <View style={{ flex: 1 }}>
                      <Text style={font.h3}>{s.name}</Text>
                      <Text style={font.small}>{s.address}</Text>
                      <Text style={font.small}>Student code: {s.studentCode}</Text>
                    </View>
                  </Row>
                </Card>
              ))
            )}

            <Text style={[font.h2, { marginTop: 6 }]}>Drivers</Text>
            {overview.drivers.length === 0 ? (
              <Empty title="No drivers yet" hint="Drivers join with your code, then you assign them to routes." />
            ) : (
              overview.drivers.map((d) => (
                <Card key={d.id}>
                  <Row>
                    <Avatar name={d.name} />
                    <View>
                      <Text style={font.h3}>{d.name}</Text>
                      <Text style={font.small}>{d.email}</Text>
                    </View>
                  </Row>
                </Card>
              ))
            )}
          </>
        ) : null}
      </ScrollView>
      <Modal visible={adding} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setAdding(false)}>
        <AddSchool onClose={() => setAdding(false)} onCreated={load} />
      </Modal>
    </SafeAreaView>
  );
}
