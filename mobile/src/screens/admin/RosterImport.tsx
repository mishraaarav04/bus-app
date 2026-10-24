import React, { useState } from "react";
import { Pressable, Switch, Text, View } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { api } from "../../api/client";
import { PageModal } from "../../components/PageModal";
import { Button, Card, ErrorText, Field, Pill, Row } from "../../components/ui";
import { colors, font } from "../../theme";
import type { RosterReport } from "../../types";

const EXAMPLE = "name,email,parentEmail,route,stop\nAva Smith,ava@example.com,mom@example.com,Morning run - North,Oak & 3rd";

/**
 * Add many students at once from a spreadsheet saved as CSV: paste it or pick the
 * file. "Check first" is a dry run that shows what would happen; nothing changes
 * until you tap Import.
 */
export function RosterImport({
  visible,
  onClose,
  onImported,
}: {
  visible: boolean;
  onClose: () => void;
  onImported: () => void;
}) {
  const [csv, setCsv] = useState("");
  const [invites, setInvites] = useState(true);
  const [report, setReport] = useState<RosterReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  function reset() {
    setCsv("");
    setReport(null);
    setError(null);
    setDone(false);
  }

  async function pick() {
    setError(null);
    try {
      const r = await DocumentPicker.getDocumentAsync({
        type: ["text/csv", "text/comma-separated-values", "text/plain", "application/vnd.ms-excel"],
        copyToCacheDirectory: true,
      });
      if (r.canceled || !r.assets?.[0]) return;
      const text = await (await fetch(r.assets[0].uri)).text();
      setCsv(text);
      setReport(null);
      setDone(false);
    } catch {
      setError("Couldn't read that file. Try pasting the rows instead.");
    }
  }

  async function check() {
    setBusy(true);
    setError(null);
    try {
      setReport(await api.rosterPreview(csv));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function run() {
    setBusy(true);
    setError(null);
    try {
      setReport(await api.rosterImport(csv, invites));
      setDone(true);
      onImported();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const canImport = !!report && !done && report.created + report.updated > 0;

  return (
    <PageModal
      visible={visible}
      title="Import students"
      onClose={() => {
        onClose();
        if (done) reset();
      }}
      footer={
        <Row>
          <Button title="Check first" variant="soft" style={{ flex: 1 }} onPress={check} loading={busy && !canImport} disabled={!csv.trim() || done} />
          <Button title="Import" style={{ flex: 1 }} onPress={run} loading={busy && canImport} disabled={!canImport} />
        </Row>
      }
    >
      <Text style={font.small}>
        Needs a name column. Optional: email, parentEmail, route, stop, tagId. Up to 500 students at a time.
      </Text>
      <Button title="Choose a CSV file" variant="outline" onPress={pick} />
      <Field
        label="…or paste rows here"
        value={csv}
        onChangeText={(v) => {
          setCsv(v);
          setReport(null);
          setDone(false);
        }}
        placeholder={EXAMPLE}
        multiline
        autoCapitalize="none"
        autoCorrect={false}
        style={{ minHeight: 120, paddingTop: 12, textAlignVertical: "top" }}
      />
      <Row>
        <View style={{ flex: 1 }}>
          <Text style={font.body}>Email invites to parents</Text>
          <Text style={font.small}>Sends each parent their child's code (skipped if no parentEmail).</Text>
        </View>
        <Switch value={invites} onValueChange={setInvites} trackColor={{ true: colors.primary }} accessibilityLabel="Email invites to parents" />
      </Row>
      <ErrorText text={error} />

      {report ? (
        <>
          <Row style={{ flexWrap: "wrap" }}>
            <Pill text={`${report.created} ${done ? "created" : "to create"}`} tone="green" />
            <Pill text={`${report.updated} ${done ? "updated" : "to update"}`} tone="orange" />
            {report.errors ? <Pill text={`${report.errors} with problems`} tone="red" /> : null}
            {done && report.invitesSent ? <Pill text={`${report.invitesSent} invites sent`} tone="gray" /> : null}
          </Row>
          {report.rows
            .filter((r) => r.status === "error" || r.warnings.length)
            .map((r) => (
              <Card key={r.line}>
                <Text style={font.h3}>
                  Line {r.line}: {r.name || "(no name)"}
                </Text>
                {r.message ? <Text style={{ color: colors.danger }}>{r.message}</Text> : null}
                {r.warnings.map((w, i) => (
                  <Text key={i} style={font.small}>
                    {w}
                  </Text>
                ))}
              </Card>
            ))}
          {done
            ? report.rows
                .filter((r) => r.status !== "error" && r.linkCode)
                .slice(0, 100)
                .map((r) => (
                  <Pressable key={r.line}>
                    <Text style={font.small} selectable>
                      {r.name}: {r.linkCode}
                    </Text>
                  </Pressable>
                ))
            : null}
        </>
      ) : null}
    </PageModal>
  );
}
