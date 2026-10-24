import React, { useCallback, useEffect, useState } from "react";
import { Pressable, RefreshControl, ScrollView, Share, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "../../api/client";
import { Button, Card, Empty, ErrorText, Pill, Row } from "../../components/ui";
import { colors, font } from "../../theme";
import type { AuditRow, ReportSummary, ReportTotals } from "../../types";

const RANGES = [7, 30, 90];
const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const pct = (v: number | null) => (v == null ? "-" : `${Math.round(v)}%`);

function Stat({ label, value, tone }: { label: string; value: string | number; tone?: string }) {
  return (
    <View style={{ minWidth: "30%", flexGrow: 1, gap: 2 }}>
      <Text style={{ fontSize: 24, fontWeight: "900", color: tone ?? colors.ink }}>{value}</Text>
      <Text style={font.small}>{label}</Text>
    </View>
  );
}

function Totals({ t }: { t: ReportTotals }) {
  return (
    <Row style={{ flexWrap: "wrap", rowGap: 14 }}>
      <Stat label="Rides" value={t.rides} />
      <Stat label="Boarded" value={pct(t.boardedPct)} tone={colors.success} />
      <Stat label="Missed" value={t.missed} tone={t.missed ? colors.danger : undefined} />
      <Stat label="Incidents" value={t.incidents} tone={t.incidents ? colors.warning : undefined} />
      <Stat label="On time" value={t.scheduledRides ? `${t.onTimeRides}/${t.scheduledRides}` : "-"} />
      <Stat label="Avg. late" value={t.avgLateMin == null ? "-" : `${t.avgLateMin} min`} />
    </Row>
  );
}

const ACTIONS: Record<string, string> = {
  "ride.start": "Started a ride",
  "ride.end": "Ended a ride",
  "route.create": "Created a route",
  "route.send": "Sent a route",
  "route.delete": "Deleted a route",
  "route.driver_assign": "Assigned a driver",
  "route.driver_clear": "Removed a route's driver",
  "ride.handover": "Handed a live ride to a new driver",
  "route.schedule": "Changed a start time",
  "assignment.set": "Changed a student's stop",
  "roster.import": "Imported a student list",
  "report.export": "Exported a report",
  "company.bus_spec": "Changed bus size",
  "auth.password_change": "Changed password",
  "auth.password_reset": "Reset password",
  "school.create": "Added a school",
  "auth.login": "Signed in",
  "auth.locked": "Account locked after failed sign-ins",
  "account.delete": "Deleted an account",
};

/** Company and school: totals, per-route results, ride list, CSV export, activity log. */
export function ReportsScreen() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<ReportSummary | null>(null);
  const [audit, setAudit] = useState<AuditRow[] | null>(null);
  const [showAudit, setShowAudit] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const range = useCallback(() => {
    const to = new Date();
    const from = new Date(Date.now() - (days - 1) * 86_400_000);
    return { from: ymd(from), to: ymd(to) };
  }, [days]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { from, to } = range();
      setData(await api.reportSummary(from, to));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (showAudit && !audit) api.audit().then(setAudit).catch((e) => setError(e.message));
  }, [showAudit, audit]);

  async function exportCsv(kind: "rides" | "boardings") {
    try {
      const { from, to } = range();
      const csv = await (kind === "rides" ? api.ridesCsv(from, to) : api.boardingsCsv(from, to));
      await Share.share({ message: csv, title: `wheelie-${kind}-${from}-to-${to}.csv` });
    } catch (e: any) {
      setError(e.message);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }} edges={["top"]}>
      <ScrollView
        contentContainerStyle={{ padding: 20, gap: 12 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.primary} />}
      >
        <Text style={font.title} accessibilityRole="header">Reports</Text>
        <Row>
          {RANGES.map((d) => (
            <Pressable key={d} onPress={() => setDays(d)} accessibilityRole="button" accessibilityState={{ selected: d === days }}>
              <Pill text={`${d} days`} tone={d === days ? "orange" : "gray"} />
            </Pressable>
          ))}
        </Row>
        <ErrorText text={error} />

        {data && data.totals.rides === 0 ? (
          <Empty title="No finished rides in this period" hint="Results appear here after rides are ended." />
        ) : null}

        {data && data.totals.rides > 0 ? (
          <>
            <Card>
              <Totals t={data.totals} />
            </Card>

            <Text style={font.h3}>By route</Text>
            {data.routes.map((r) => (
              <Card key={r.routeId}>
                <Text style={font.h3}>{r.routeName}</Text>
                <Totals t={r} />
              </Card>
            ))}

            <Text style={font.h3}>Recent rides</Text>
            {data.rides.slice(0, 30).map((r) => (
              <Card key={r.rideId}>
                <Row style={{ justifyContent: "space-between" }}>
                  <View style={{ flex: 1 }}>
                    <Text style={font.h3}>{r.routeName}</Text>
                    <Text style={font.small}>
                      {r.date} · {r.direction === "to_school" ? "to school" : "to home"}
                      {r.driverName ? ` · ${r.driverName}` : ""}
                    </Text>
                    <Text style={font.small}>
                      {r.boarded}/{r.riders} boarded
                      {r.missed ? ` · ${r.missed} missed` : ""}
                      {r.skipped ? ` · ${r.skipped} not riding` : ""}
                    </Text>
                  </View>
                  <View style={{ gap: 6, alignItems: "flex-end" }}>
                    {r.lateMin != null && r.lateMin > 5 ? <Pill text={`${r.lateMin} min late`} tone="amber" /> : null}
                    {r.incidents ? <Pill text={`${r.incidents} incident${r.incidents > 1 ? "s" : ""}`} tone="red" /> : null}
                  </View>
                </Row>
              </Card>
            ))}

            <Text style={font.h3}>Export</Text>
            <Text style={font.small}>Opens the share sheet so you can save the file, email it, or send it to a spreadsheet app.</Text>
            <Row>
              <Button title="Rides (CSV)" variant="soft" style={{ flex: 1 }} onPress={() => exportCsv("rides")} />
              <Button title="Boardings (CSV)" variant="soft" style={{ flex: 1 }} onPress={() => exportCsv("boardings")} />
            </Row>
          </>
        ) : null}

        <Button title={showAudit ? "Hide activity log" : "Show activity log"} variant="outline" onPress={() => setShowAudit(!showAudit)} />
        {showAudit
          ? (audit ?? []).map((a) => (
              <Card key={a.id}>
                <Text style={font.body}>{ACTIONS[a.action] ?? a.action}</Text>
                <Text style={font.small}>
                  {a.actorName ?? "System"}
                  {a.actorRole ? ` (${a.actorRole})` : ""} · {new Date(a.at).toLocaleString()}
                </Text>
              </Card>
            ))
          : null}
        {showAudit && audit && audit.length === 0 ? <Empty title="Nothing logged yet" /> : null}
      </ScrollView>
    </SafeAreaView>
  );
}
