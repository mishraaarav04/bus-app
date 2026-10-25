import React, { useEffect, useState } from "react";
import { Alert, Linking, ScrollView, Share, Switch, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useT, type Key } from "../i18n";
import { registerForPush } from "../push";
import { colors, font } from "../theme";
import type { Child, NotifPrefs } from "../types";
import { LanguagePicker } from "./LanguagePicker";
import { PageModal } from "./PageModal";
import { Avatar, Button, Card, ErrorText, Field, Pill, Row } from "./ui";

const ROLE_LABEL: Record<string, Key> = {
  student: "role.student",
  parent: "role.parent",
  driver: "role.driver",
  company: "role.company",
  admin: "role.school",
};

function CodeCard({ title, hint, code, onRotate }: { title: string; hint: string; code: string; onRotate?: () => void }) {
  const { t } = useT();
  return (
    <Card>
      <Text style={font.h3}>{title}</Text>
      <Text style={{ fontSize: 28, fontWeight: "900", letterSpacing: 2, color: colors.primaryDark }} selectable>
        {code}
      </Text>
      <Text style={font.small}>{hint}</Text>
      <Row>
        <Button
          title={t("account.share")}
          variant="soft"
          style={{ flex: 1 }}
          onPress={() => Share.share({ message: t("account.shareMsg", { code }) })}
        />
        {onRotate ? <Button title={t("account.newCode")} variant="outline" style={{ flex: 1 }} onPress={onRotate} /> : null}
      </Row>
    </Card>
  );
}

function VerifyEmail() {
  const { t } = useT();
  const { user, refreshUser } = useAuth();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  if (!user || user.emailVerified) return null;

  async function verify() {
    setError(null);
    setBusy(true);
    try {
      await api.verifyEmail(code.trim());
      await refreshUser();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function resend() {
    setError(null);
    try {
      await api.resendVerification();
      setSent(true);
    } catch (e: any) {
      setError(e.message);
    }
  }
  return (
    <Card style={{ backgroundColor: colors.warningSoft, borderColor: colors.warning }}>
      <Text style={font.h3}>{t("verify.title")}</Text>
      <Text style={font.small}>{sent ? t("verify.sent") : t("verify.hint", { email: user.email })}</Text>
      <Field label={t("forgot.code")} value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={6} />
      <ErrorText text={error} />
      <Row>
        <Button title={t("verify.resend")} variant="outline" style={{ flex: 1 }} onPress={resend} />
        <Button title={t("verify.confirm")} style={{ flex: 1 }} onPress={verify} loading={busy} disabled={code.length !== 6} />
      </Row>
    </Card>
  );
}

function ChildCard({ child, onChanged }: { child: Child; onChanged: () => void }) {
  const { t } = useT();
  const [adultOnly, setAdultOnly] = useState(child.requiresAdultPickup);
  const [names, setNames] = useState(child.authorizedPickups.join(", "));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await api.childSettings(child.id, {
        requiresAdultPickup: adultOnly,
        authorizedPickups: names
          .split(",")
          .map((n) => n.trim())
          .filter(Boolean)
          .slice(0, 5),
      });
      setSaved(true);
      onChanged();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  function unlink() {
    Alert.alert(t("child.unlinkQ", { name: child.name }), t("child.unlinkWhy"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("child.unlink"),
        style: "destructive",
        onPress: async () => {
          try {
            await api.unlinkChild(child.id);
            onChanged();
          } catch (e: any) {
            Alert.alert(t("common.error"), e.message);
          }
        },
      },
    ]);
  }

  return (
    <Card>
      <Row>
        <Avatar name={child.name} size={36} />
        <Text style={[font.h3, { flex: 1 }]}>{child.name}</Text>
      </Row>
      <Row>
        <View style={{ flex: 1 }}>
          <Text style={font.body}>{t("child.adultOnly")}</Text>
          <Text style={font.small}>{t("child.adultOnlyHint")}</Text>
        </View>
        <Switch
          value={adultOnly}
          onValueChange={(v) => {
            setAdultOnly(v);
            setSaved(false);
          }}
          trackColor={{ true: colors.primary }}
          accessibilityLabel={t("child.adultOnly")}
        />
      </Row>
      {adultOnly ? (
        <Field
          label={t("child.authorized")}
          value={names}
          onChangeText={(v) => {
            setNames(v);
            setSaved(false);
          }}
          placeholder={t("child.authorizedPh")}
        />
      ) : null}
      <ErrorText text={error} />
      <Row>
        <Button title={t("child.unlink")} variant="outline" style={{ flex: 1 }} onPress={unlink} />
        <Button title={saved ? t("common.saved") : t("common.save")} style={{ flex: 1 }} onPress={save} loading={busy} />
      </Row>
    </Card>
  );
}

function ChangePassword() {
  const { t } = useT();
  const { adoptSession } = useAuth();
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setError(null);
    setBusy(true);
    try {
      // Other devices are signed out; this one gets a fresh session.
      const r = await api.changePassword(current, next);
      await adoptSession({ token: r.token, refreshToken: r.refreshToken });
      setOpen(false);
      setCurrent("");
      setNext("");
      Alert.alert(t("pw.changed"));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (!open) return <Button title={t("pw.change")} variant="outline" onPress={() => setOpen(true)} />;
  return (
    <Card>
      <Text style={font.h3}>{t("pw.change")}</Text>
      <Field label={t("pw.current")} value={current} onChangeText={setCurrent} secureTextEntry autoCapitalize="none" />
      <Field label={t("pw.new")} value={next} onChangeText={setNext} secureTextEntry autoCapitalize="none" />
      <Text style={font.small}>{t("login.pwRule")}</Text>
      <ErrorText text={error} />
      <Row>
        <Button title={t("common.cancel")} variant="outline" style={{ flex: 1 }} onPress={() => setOpen(false)} />
        <Button title={t("common.save")} style={{ flex: 1 }} onPress={save} loading={busy} disabled={!current || !next} />
      </Row>
    </Card>
  );
}

function Notifications() {
  const { t } = useT();
  const { user, setUser } = useAuth();
  if (!user) return null;
  const prefs = user.notifPrefs;
  const rows: { key: keyof NotifPrefs; label: Key }[] = [
    { key: "approaching", label: "notif.approaching" },
    { key: "boarding", label: "notif.boarding" },
    { key: "delays", label: "notif.delays" },
  ];
  const showFor = user.role === "student" || user.role === "parent";

  async function toggle(key: keyof NotifPrefs, value: boolean) {
    setUser({ ...user!, notifPrefs: { ...prefs, [key]: value } }); // instant feedback
    try {
      setUser(await api.savePreferences({ notifPrefs: { [key]: value } }));
    } catch {
      setUser({ ...user!, notifPrefs: prefs });
    }
  }

  async function enablePush() {
    const r = await registerForPush();
    Alert.alert(r === "ok" ? t("notif.enabled") : r === "denied" ? t("notif.denied") : t("notif.unsupported"));
  }

  return (
    <Card>
      <Text style={font.h3}>{t("notif.title")}</Text>
      {showFor
        ? rows.map((r) => (
            <Row key={r.key}>
              <Text style={[font.body, { flex: 1 }]}>{t(r.label)}</Text>
              <Switch
                value={prefs[r.key]}
                onValueChange={(v) => void toggle(r.key, v)}
                trackColor={{ true: colors.primary }}
                accessibilityLabel={t(r.label)}
              />
            </Row>
          ))
        : null}
      <Button title={t("notif.enable")} variant="soft" onPress={enablePush} />
    </Card>
  );
}

function Privacy() {
  const { t } = useT();
  const { user, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [legal, setLegal] = useState<{ privacyUrl: string | null; termsUrl: string | null } | null>(null);
  useEffect(() => {
    api.legal().then(setLegal).catch(() => {});
  }, []);

  async function exportData() {
    try {
      const json = await api.exportMyData();
      await Share.share({ message: json, title: "Wheelie data export" });
    } catch (e: any) {
      Alert.alert(t("common.error"), e.message);
    }
  }

  async function del() {
    setBusy(true);
    setError(null);
    try {
      await api.deleteAccount(password);
      setOpen(false);
      await signOut();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (!user) return null;
  return (
    <Card>
      <Text style={font.h3}>{t("privacy.title")}</Text>
      <Text style={font.small}>{t("privacy.hint")}</Text>
      {legal?.privacyUrl ? <Button title={t("login.privacy")} variant="outline" onPress={() => Linking.openURL(legal.privacyUrl!)} /> : null}
      {legal?.termsUrl ? <Button title={t("login.terms")} variant="outline" onPress={() => Linking.openURL(legal.termsUrl!)} /> : null}
      <Button title={t("privacy.export")} variant="outline" onPress={exportData} />
      <Button title={t("privacy.delete")} variant="outline" onPress={() => setOpen(true)} />

      <PageModal
        visible={open}
        title={t("privacy.delete")}
        onClose={() => setOpen(false)}
        footer={<Button title={t("privacy.deleteConfirm")} variant="danger" onPress={del} loading={busy} disabled={!password} />}
      >
        <Text style={font.body}>{t("privacy.deleteWarn")}</Text>
        <Field label={t("login.password")} value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" />
        <ErrorText text={error} />
      </PageModal>
    </Card>
  );
}

export function AccountTab() {
  const { t } = useT();
  const { user, signOut, refreshUser } = useAuth();
  const [kids, setKids] = useState<Child[]>([]);
  const [childCode, setChildCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadKids = () => {
    if (user?.role === "parent") api.parentChildren().then(setKids).catch(() => {});
  };
  useEffect(loadKids, [user?.role, user?.linkedStudentIds?.length]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!user) return null;

  async function linkChild() {
    setError(null);
    setBusy(true);
    try {
      await api.linkChild(childCode.trim());
      setChildCode("");
      await refreshUser();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function rotate() {
    Alert.alert(t("account.newCodeQ"), t("account.newCodeWhy"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("account.newCode"),
        onPress: async () => {
          try {
            await api.rotateLinkCode();
            await refreshUser();
          } catch (e: any) {
            Alert.alert(t("common.error"), e.message);
          }
        },
      },
    ]);
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }} edges={["top"]}>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 14 }}>
        <Row style={{ marginBottom: 6 }}>
          <Avatar name={user.name} size={64} />
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={font.title}>{user.name}</Text>
            <Text style={font.small}>{user.email}</Text>
            <Pill text={t(ROLE_LABEL[user.role])} tone="orange" />
          </View>
        </Row>

        <VerifyEmail />

        {user.role === "student" && user.linkCode ? (
          <CodeCard title={t("account.parentCode")} hint={t("account.parentCodeHint")} code={user.linkCode} onRotate={rotate} />
        ) : null}
        {user.role === "company" && user.driverCode ? (
          <CodeCard title={t("account.driverCode")} hint={t("account.driverCodeHint")} code={user.driverCode} />
        ) : null}
        {user.role === "admin" && user.studentCode ? (
          <CodeCard title={t("account.studentCode")} hint={t("account.studentCodeHint")} code={user.studentCode} />
        ) : null}

        {user.role === "parent" ? (
          <>
            <Text style={font.h3}>{t("account.children")}</Text>
            {kids.map((k) => (
              <ChildCard key={`${k.id}-${k.requiresAdultPickup}`} child={k} onChanged={() => { loadKids(); void refreshUser(); }} />
            ))}
            <Card>
              <Field
                label={t("account.linkAnother")}
                value={childCode}
                onChangeText={setChildCode}
                placeholder="KID-XXXXXX"
                autoCapitalize="characters"
                autoCorrect={false}
              />
              <ErrorText text={error} />
              <Button title={t("account.linkChild")} variant="soft" onPress={linkChild} loading={busy} disabled={!childCode.trim()} />
            </Card>
          </>
        ) : null}

        <Notifications />

        <Card>
          <Text style={font.h3}>{t("account.language")}</Text>
          <LanguagePicker />
        </Card>

        <ChangePassword />
        <Privacy />
        <Button title={t("account.signOut")} variant="soft" onPress={signOut} />
      </ScrollView>
    </SafeAreaView>
  );
}
