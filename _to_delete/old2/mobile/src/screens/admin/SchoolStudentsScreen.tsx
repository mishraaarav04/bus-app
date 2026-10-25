import React, { useCallback, useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, Share, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "../../api/client";
import { Avatar, Button, Card, Empty, ErrorText, Pill, Row } from "../../components/ui";
import { colors, font } from "../../theme";
import { RosterImport } from "./RosterImport";
import { Route, SchoolStudent } from "../../types";

export function SchoolStudentsScreen() {
  const [students, setStudents] = useState<SchoolStudent[]>([]);
  const [code, setCode] = useState("");
  const [routes, setRoutes] = useState<Route[]>([]);
  const [editing, setEditing] = useState<SchoolStudent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  const load = useCallback(async () => {
    try {
      const [s, r] = await Promise.all([api.schoolStudents(), api.listRoutes()]);
      setStudents(s.students);
      setCode(s.studentCode);
      setRoutes(r);
    } catch (e: any) {
      setError(e.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function assign(routeId: string, stopId: string | null) {
    if (!editing) return;
    setError(null);
    try {
      await api.assignStudent(routeId, editing.id, stopId);
      await load();
      setEditing(null);
    } catch (e: any) {
      setError(e.message);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }} edges={["top"]}>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 12 }}>
        <Text style={font.title}>Students</Text>
        <Card>
          <Text style={font.h3}>Student sign-up code</Text>
          <Text style={{ fontSize: 26, fontWeight: "900", letterSpacing: 2, color: colors.primaryDark }}>{code}</Text>
          <Button title="Share code" variant="soft" onPress={() => Share.share({ message: `Join Wheelie with school code ${code}` })} />
        </Card>
        <Button title="Import a student list (CSV)" variant="outline" onPress={() => setImporting(true)} />
        <ErrorText text={error} />
        {students.length === 0 ? (
          <Empty title="No students yet" hint="Students appear here after they sign up with your code." />
        ) : (
          students.map((s) => (
            <Pressable key={s.id} onPress={() => setEditing(s)}>
              <Card>
                <Row>
                  <Avatar name={s.name} />
                  <View style={{ flex: 1 }}>
                    <Text style={font.h3}>{s.name}</Text>
                    <Text style={font.small}>
                      {s.assignments.length
                        ? s.assignments.map((a) => `${a.routeName}: ${a.stopName}`).join("\n")
                        : "No stop assigned"}
                    </Text>
                    {!s.claimed && s.linkCode ? (
                      <Text style={font.small} selectable>
                        Parent code: {s.linkCode}
                      </Text>
                    ) : null}
                  </View>
                  <View style={{ gap: 6, alignItems: "flex-end" }}>
                    <Pill text={s.assignments.length ? "Assigned" : "Assign"} tone={s.assignments.length ? "green" : "amber"} />
                    {!s.claimed ? <Pill text="No login yet" tone="gray" /> : null}
                  </View>
                </Row>
              </Card>
            </Pressable>
          ))
        )}
      </ScrollView>

      <RosterImport visible={importing} onClose={() => setImporting(false)} onImported={load} />

      <Modal visible={Boolean(editing)} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setEditing(null)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.white }}>
          <ScrollView contentContainerStyle={{ padding: 20, gap: 12 }}>
            <Text style={font.title}>{editing?.name}</Text>
            <Text style={font.small}>Pick the stop where this student gets on.</Text>
            <ErrorText text={error} />
            {routes.length === 0 ? <Empty title="No routes yet" hint="Your bus company hasn't sent any routes." /> : null}
            {routes.map((r) => {
              const current = editing?.assignments.find((a) => a.routeId === r.id)?.stopId;
              return (
                <Card key={r.id}>
                  <Text style={font.h3}>{r.name}</Text>
                  <Text style={font.small}>{r.direction === "to_school" ? "To school" : "To home"}</Text>
                  {[...r.stops].sort((a, b) => a.order - b.order).map((stop) => (
                    <Pressable key={stop.id} onPress={() => assign(r.id, stop.id)}>
                      <Row style={{ paddingVertical: 6 }}>
                        <Pill text={String(stop.order + 1)} tone={current === stop.id ? "orange" : "gray"} />
                        <Text style={[font.body, { flex: 1, fontWeight: current === stop.id ? "800" : "400" }]}>{stop.name}</Text>
                        {current === stop.id ? <Pill text="Current" tone="green" /> : null}
                      </Row>
                    </Pressable>
                  ))}
                  {current ? <Button title="Remove from this route" variant="outline" onPress={() => assign(r.id, null)} /> : null}
                </Card>
              );
            })}
            <Button title="Close" variant="soft" onPress={() => setEditing(null)} />
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}
