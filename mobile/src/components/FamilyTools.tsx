import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { api } from "../api/client";
import { PageModal } from "./PageModal";
import { Button, Card, Empty, ErrorText, Pill, Row } from "./ui";
import { useT } from "../i18n";
import { colors, font } from "../theme";
import type { Absence, HistoryEvent } from "../types";

type Dir = "to_school" | "to_home" | "both";
interface Kid {
  id: string;
  name: string;
}

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseYmd = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};

/**
 * "Plan ahead" (tell the driver in advance a child won't ride) and ride history,
 * for a student or a parent's linked children.
 */
export function FamilyTools({ visible, onClose, kids }: { visible: boolean; onClose: () => void; kids: Kid[] }) {
  const { t, locale } = useT();
  const [tab, setTab] = useState<"plan" | "history">("plan");
  const [kidId, setKidId] = useState<string | null>(null);
  const [dir, setDir] = useState<Dir>("both");
  const [date, setDate] = useState(() => ymd(new Date()));
  const [absences, setAbsences] = useState<Absence[]>([]);
  const [history, setHistory] = useState<HistoryEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const kid = kidId ?? kids[0]?.id ?? null;
  const days = useMemo(() => Array.from({ length: 14 }, (_, i) => new Date(Date.now() + i * 86_400_000)), [visible]);
  const fmt = (s: string, opts: Intl.DateTimeFormatOptions) => parseYmd(s).toLocaleDateString(locale, opts);

  const loadAbsences = useCallback(() => {
    api.absences().then(setAbsences).catch(() => {});
  }, []);

  useEffect(() => {
    if (visible) loadAbsences();
  }, [visible, loadAbsences]);

  useEffect(() => {
    if (!visible || tab !== "history" || !kid) return;
    setHistory(null);
    api
      .history(kid)
      .then((r) => setHistory(r.events))
      .catch((e) => setError(e.message));
  }, [visible, tab, kid]);

  async function add() {
    if (!kid) return;
    setBusy(true);
    setError(null);
    try {
      await api.addAbsence({ studentId: kid, date, direction: dir });
      loadAbsences();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function cancel(a: Absence) {
    try {
      await api.removeAbsence({ studentId: a.studentId, date: a.date, direction: a.direction });
      loadAbsences();
    } catch (e: any) {
      setError(e.message);
    }
  }

  const dirLabel = (d: Dir) => (d === "both" ? t("plan.both") : d === "to_school" ? t("plan.toSchool") : t("plan.toHome"));

  return (
    <PageModal visible={visible} title={t("plan.title")} onClose={onClose}>
      <Row>
        {(["plan", "history"] as const).map((k) => (
          <Pressable
            key={k}
            onPress={() => setTab(k)}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === k }}
            style={{ flex: 1 }}
          >
            <Pill text={k === "plan" ? t("plan.tabPlan") : t("plan.tabHistory")} tone={tab === k ? "orange" : "gray"} />
          </Pressable>
        ))}
      </Row>

      {kids.length > 1 ? (
        <Row style={{ flexWrap: "wrap" }}>
          {kids.map((k) => (
            <Pressable key={k.id} onPress={() => setKidId(k.id)} accessibilityRole="button" accessibilityState={{ selected: k.id === kid }}>
              <Pill text={k.name} tone={k.id === kid ? "orange" : "gray"} />
            </Pressable>
          ))}
        </Row>
      ) : null}

      {tab === "plan" ? (
        <>
          <Text style={font.small}>{t("plan.hint")}</Text>
          <Text style={font.h3}>{t("plan.pickDay")}</Text>
          <Row style={{ flexWrap: "wrap", gap: 8 }}>
            {days.map((d) => {
              const v = ymd(d);
              return (
                <Pressable key={v} onPress={() => setDate(v)} accessibilityRole="button" accessibilityState={{ selected: v === date }}>
                  <Pill
                    text={d.toLocaleDateString(locale, { weekday: "short", day: "numeric" })}
                    tone={v === date ? "orange" : "gray"}
                  />
                </Pressable>
              );
            })}
          </Row>
          <Row style={{ flexWrap: "wrap" }}>
            {(["both", "to_school", "to_home"] as Dir[]).map((d) => (
              <Pressable key={d} onPress={() => setDir(d)} accessibilityRole="button" accessibilityState={{ selected: d === dir }}>
                <Pill text={dirLabel(d)} tone={d === dir ? "orange" : "gray"} />
              </Pressable>
            ))}
          </Row>
          <ErrorText text={error} />
          <Button title={t("plan.add")} onPress={add} loading={busy} disabled={!kid} />

          <Text style={[font.h3, { marginTop: 8 }]}>{t("plan.upcoming")}</Text>
          {absences.length === 0 ? (
            <Empty title={t("plan.none")} />
          ) : (
            absences.map((a) => (
              <Card key={`${a.studentId}-${a.date}-${a.direction}`}>
                <Row>
                  <View style={{ flex: 1 }}>
                    <Text style={font.h3}>{fmt(a.date, { weekday: "long", month: "short", day: "numeric" })}</Text>
                    <Text style={font.small}>
                      {a.studentName} · {dirLabel(a.direction)}
                    </Text>
                  </View>
                  <Button title={t("common.cancel")} variant="outline" onPress={() => cancel(a)} style={{ minHeight: 40, paddingHorizontal: 14 }} />
                </Row>
              </Card>
            ))
          )}
        </>
      ) : history === null ? (
        <ErrorText text={error} />
      ) : history.length === 0 ? (
        <Empty title={t("history.none")} hint={t("history.noneHint")} />
      ) : (
        history.map((h, i) => (
          <Card key={i}>
            <Row>
              <View style={{ flex: 1 }}>
                <Text style={font.h3}>{fmt(h.date, { weekday: "short", month: "short", day: "numeric" })}</Text>
                <Text style={font.small}>
                  {h.routeName}
                  {h.stopName ? ` · ${h.stopName}` : ""}
                </Text>
                {h.boardedAt ? (
                  <Text style={{ color: colors.success, fontSize: 13 }}>
                    {t("history.boarded", { time: new Date(h.boardedAt).toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" }) })}
                    {h.droppedAt
                      ? ` · ${t("history.dropped", { time: new Date(h.droppedAt).toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" }) })}`
                      : ""}
                  </Text>
                ) : null}
              </View>
              <Pill
                text={t(`status.${h.status}` as any)}
                tone={h.status === "boarded" ? "green" : h.status === "missed" ? "red" : "gray"}
              />
            </Row>
          </Card>
        ))
      )}
    </PageModal>
  );
}
