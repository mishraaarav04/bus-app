import React, { useEffect, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useT, type Key } from "../i18n";
import { LanguagePicker } from "../components/LanguagePicker";
import { Button, ErrorText, Field } from "../components/ui";
import { Logo } from "../components/Logo";
import { colors, font, radius } from "../theme";

type SignupRole = "student" | "parent" | "driver";

const ROLE_INFO: Record<
  SignupRole,
  { icon: keyof typeof Ionicons.glyphMap; codeField: string; title: Key; blurb: Key; codeLabel: Key; codeHint: Key }
> = {
  student: {
    icon: "school",
    codeField: "schoolCode",
    title: "role.student",
    blurb: "login.studentBlurb",
    codeLabel: "login.schoolCode",
    codeHint: "login.schoolCodeHint",
  },
  parent: {
    icon: "people",
    codeField: "childCode",
    title: "role.parent",
    blurb: "login.parentBlurb",
    codeLabel: "login.childCode",
    codeHint: "login.childCodeHint",
  },
  driver: {
    icon: "bus",
    codeField: "companyCode",
    title: "role.driver",
    blurb: "login.driverBlurb",
    codeLabel: "login.companyCode",
    codeHint: "login.companyCodeHint",
  },
};

export function LoginScreen({ initialMode = "login" }: { initialMode?: "login" | "signup" | "forgot" }) {
  const [mode, setMode] = useState<"login" | "signup" | "forgot">(initialMode);
  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {mode === "login" ? (
            <Login onSwitch={() => setMode("signup")} onForgot={() => setMode("forgot")} />
          ) : mode === "signup" ? (
            <Signup onSwitch={() => setMode("login")} />
          ) : (
            <Forgot onDone={() => setMode("login")} />
          )}
          <View style={{ marginTop: 24, alignItems: "center" }}>
            <LanguagePicker />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Login({ onSwitch, onForgot }: { onSwitch: () => void; onForgot: () => void }) {
  const { signIn } = useAuth();
  const { t } = useT();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      await signIn(email, password);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ gap: 16 }}>
      <View style={{ alignItems: "center", marginVertical: 28 }}>
        <Logo />
        <Text style={[font.small, { marginTop: 8 }]}>{t("login.tagline")}</Text>
      </View>
      <Field
        label={t("login.email")}
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        autoComplete="email"
        textContentType="username"
      />
      <Field
        label={t("login.password")}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoCapitalize="none"
        autoComplete="current-password"
        textContentType="password"
        onSubmitEditing={submit}
      />
      <ErrorText text={error} />
      <Button title={t("login.signIn")} onPress={submit} loading={busy} disabled={!email || !password} />
      <Pressable onPress={onForgot} style={{ alignItems: "center", padding: 8 }} accessibilityRole="button">
        <Text style={{ color: colors.primaryDark, fontWeight: "800" }}>{t("login.forgot")}</Text>
      </Pressable>
      <Pressable onPress={onSwitch} style={{ alignItems: "center", padding: 12 }} accessibilityRole="button">
        <Text style={font.small}>
          {t("login.new")} <Text style={{ color: colors.primaryDark, fontWeight: "800" }}>{t("login.create")}</Text>
        </Text>
      </Pressable>
      <Text style={[font.small, { textAlign: "center" }]}>{t("login.orgs")}</Text>
    </View>
  );
}

function Signup({ onSwitch }: { onSwitch: () => void }) {
  const { signUp } = useAuth();
  const { t, lang } = useT();
  const [accepted, setAccepted] = useState(false);
  const [legal, setLegal] = useState<{ privacyUrl: string | null; termsUrl: string | null } | null>(null);
  useEffect(() => {
    api.legal().then(setLegal).catch(() => {});
  }, []);
  const [role, setRole] = useState<SignupRole | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!role) return;
    setError(null);
    setBusy(true);
    try {
      await signUp({
        role,
        name: name.trim(),
        email: email.trim(),
        password,
        acceptTerms: true,
        lang,
        [ROLE_INFO[role].codeField]: code.trim(),
      });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (!role) {
    return (
      <View style={{ gap: 14 }}>
        <View style={{ alignItems: "center", marginTop: 12, marginBottom: 8 }}>
          <Logo size={48} showName={false} />
          <Text style={[font.title, { marginTop: 12 }]}>{t("login.join")}</Text>
        </View>
        {(Object.keys(ROLE_INFO) as SignupRole[]).map((r) => (
          <Pressable key={r} style={styles.roleCard} onPress={() => setRole(r)} accessibilityRole="button" accessibilityLabel={t(ROLE_INFO[r].title)}>
            <View style={styles.roleIcon}>
              <Ionicons name={ROLE_INFO[r].icon} size={26} color={colors.primaryDark} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={font.h2}>{t(ROLE_INFO[r].title)}</Text>
              <Text style={font.small}>{t(ROLE_INFO[r].blurb)}</Text>
            </View>
            <Ionicons name="chevron-forward" size={22} color={colors.primary} />
          </Pressable>
        ))}
        <Pressable onPress={onSwitch} style={{ alignItems: "center", padding: 12 }}>
          <Text style={font.small}>
            {t("login.have")} <Text style={{ color: colors.primaryDark, fontWeight: "800" }}>{t("login.signIn")}</Text>
          </Text>
        </Pressable>
      </View>
    );
  }

  const info = ROLE_INFO[role];
  return (
    <View style={{ gap: 14 }}>
      <Pressable onPress={() => setRole(null)} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
        <Ionicons name="chevron-back" size={20} color={colors.primaryDark} />
        <Text style={{ color: colors.primaryDark, fontWeight: "800" }}>{t("common.back")}</Text>
      </Pressable>
      <Text style={font.title}>{t("login.signupAs", { role: t(info.title) })}</Text>
      <Field label={t("login.fullName")} value={name} onChangeText={setName} autoComplete="name" />
      <Field
        label={t("login.email")}
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        autoComplete="email"
      />
      <Field
        label={t("login.password")}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoCapitalize="none"
        autoComplete="new-password"
      />
      <Text style={font.small}>{t("login.pwRule")}</Text>
      <Field
        label={t(info.codeLabel)}
        value={code}
        onChangeText={setCode}
        autoCapitalize="characters"
        autoCorrect={false}
      />
      <Text style={font.small}>{t(info.codeHint)}</Text>
      <Pressable
        onPress={() => setAccepted(!accepted)}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: accepted }}
        style={{ flexDirection: "row", gap: 10, alignItems: "flex-start" }}
      >
        <Ionicons name={accepted ? "checkbox" : "square-outline"} size={26} color={colors.primary} />
        <Text style={[font.small, { flex: 1 }]}>
          {t("login.accept")}
          {legal?.termsUrl ? (
            <Text style={styles.link} onPress={() => Linking.openURL(legal.termsUrl!)}>
              {" "}{t("login.terms")}
            </Text>
          ) : null}
          {legal?.privacyUrl ? (
            <Text style={styles.link} onPress={() => Linking.openURL(legal.privacyUrl!)}>
              {" "}{t("login.privacy")}
            </Text>
          ) : null}
          {!legal?.termsUrl && !legal?.privacyUrl ? ` ${t("login.termsAndPrivacy")}` : ""}
        </Text>
      </Pressable>
      <ErrorText text={error} />
      <Button
        title={t("login.createBtn")}
        onPress={submit}
        loading={busy}
        disabled={!name.trim() || !email || !password || !code || !accepted}
      />
    </View>
  );
}

function Forgot({ onDone }: { onDone: () => void }) {
  const { t } = useT();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function sendCode() {
    setError(null);
    setBusy(true);
    try {
      await api.forgotPassword(email.trim());
      setStep("code");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function reset() {
    setError(null);
    setBusy(true);
    try {
      await api.resetPassword(email.trim(), code.trim(), password);
      Alert.alert(t("forgot.done"));
      onDone();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ gap: 14 }}>
      <Pressable onPress={onDone} style={{ flexDirection: "row", alignItems: "center", gap: 4 }} accessibilityRole="button">
        <Ionicons name="chevron-back" size={20} color={colors.primaryDark} />
        <Text style={{ color: colors.primaryDark, fontWeight: "800" }}>{t("common.back")}</Text>
      </Pressable>
      <Text style={font.title}>{t("forgot.title")}</Text>
      {step === "email" ? (
        <>
          <Text style={font.small}>{t("forgot.hint")}</Text>
          <Field label={t("login.email")} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
          <ErrorText text={error} />
          <Button title={t("forgot.send")} onPress={sendCode} loading={busy} disabled={!email.trim()} />
        </>
      ) : (
        <>
          <Text style={font.small}>{t("forgot.sent", { email })}</Text>
          <Field label={t("forgot.code")} value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={6} />
          <Field label={t("forgot.newPw")} value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoComplete="new-password" />
          <Text style={font.small}>{t("login.pwRule")}</Text>
          <ErrorText text={error} />
          <Button title={t("forgot.reset")} onPress={reset} loading={busy} disabled={code.length !== 6 || !password} />
          <Pressable onPress={sendCode} style={{ alignItems: "center", padding: 8 }} accessibilityRole="button">
            <Text style={{ color: colors.primaryDark, fontWeight: "800" }}>{t("forgot.again")}</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  link: { color: colors.primaryDark, fontWeight: "800", textDecorationLine: "underline" },
  safe: { flex: 1, backgroundColor: colors.white },
  scroll: { padding: 24, flexGrow: 1, justifyContent: "center" },
  roleCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 16,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  roleIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
});
