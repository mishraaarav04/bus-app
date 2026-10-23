import React, { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../context/AuthContext";
import { Button, ErrorText, Field } from "../components/ui";
import { Logo } from "../components/Logo";
import { colors, font, radius } from "../theme";

type SignupRole = "student" | "parent" | "driver";

const ROLE_INFO: Record<
  SignupRole,
  { title: string; blurb: string; icon: keyof typeof Ionicons.glyphMap; codeLabel: string; codeHint: string; codeField: string }
> = {
  student: {
    title: "Student",
    blurb: "Tap in on the bus and see your stop's ETA",
    icon: "school",
    codeLabel: "School code",
    codeHint: "From your school, e.g. SCH-XXXXXX",
    codeField: "schoolCode",
  },
  parent: {
    title: "Parent",
    blurb: "Follow your child's bus live",
    icon: "people",
    codeLabel: "Your child's code",
    codeHint: "Shown in your child's Wheelie account, e.g. KID-XXXXXX",
    codeField: "childCode",
  },
  driver: {
    title: "Driver",
    blurb: "Run your route and check students in",
    icon: "bus",
    codeLabel: "Bus company code",
    codeHint: "From your bus company, e.g. DRV-XXXXXX",
    codeField: "companyCode",
  },
};

export function LoginScreen() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {mode === "login" ? (
            <Login onSwitch={() => setMode("signup")} />
          ) : (
            <Signup onSwitch={() => setMode("login")} />
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Login({ onSwitch }: { onSwitch: () => void }) {
  const { signIn } = useAuth();
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
        <Text style={[font.small, { marginTop: 8 }]}>Know where the bus is. Always.</Text>
      </View>
      <Field
        label="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        autoComplete="email"
        textContentType="username"
      />
      <Field
        label="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoCapitalize="none"
        autoComplete="current-password"
        textContentType="password"
        onSubmitEditing={submit}
      />
      <ErrorText text={error} />
      <Button title="Sign in" onPress={submit} loading={busy} disabled={!email || !password} />
      <Pressable onPress={onSwitch} style={{ alignItems: "center", padding: 12 }}>
        <Text style={font.small}>
          New to Wheelie? <Text style={{ color: colors.primaryDark, fontWeight: "800" }}>Create an account</Text>
        </Text>
      </Pressable>
      <Text style={[font.small, { textAlign: "center" }]}>
        Bus companies and schools get their accounts from Wheelie — sign in above.
      </Text>
    </View>
  );
}

function Signup({ onSwitch }: { onSwitch: () => void }) {
  const { signUp } = useAuth();
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
          <Text style={[font.title, { marginTop: 12 }]}>Join Wheelie</Text>
          <Text style={font.small}>I'm signing up as a...</Text>
        </View>
        {(Object.keys(ROLE_INFO) as SignupRole[]).map((r) => (
          <Pressable key={r} style={styles.roleCard} onPress={() => setRole(r)}>
            <View style={styles.roleIcon}>
              <Ionicons name={ROLE_INFO[r].icon} size={26} color={colors.primaryDark} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={font.h2}>{ROLE_INFO[r].title}</Text>
              <Text style={font.small}>{ROLE_INFO[r].blurb}</Text>
            </View>
            <Ionicons name="chevron-forward" size={22} color={colors.primary} />
          </Pressable>
        ))}
        <Pressable onPress={onSwitch} style={{ alignItems: "center", padding: 12 }}>
          <Text style={font.small}>
            Already have an account? <Text style={{ color: colors.primaryDark, fontWeight: "800" }}>Sign in</Text>
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
        <Text style={{ color: colors.primaryDark, fontWeight: "800" }}>Back</Text>
      </Pressable>
      <Text style={font.title}>{info.title} sign-up</Text>
      <Field label="Full name" value={name} onChangeText={setName} autoComplete="name" />
      <Field
        label="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        autoComplete="email"
      />
      <Field
        label="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoCapitalize="none"
        autoComplete="new-password"
      />
      <Text style={font.small}>At least 8 characters with a letter and a number.</Text>
      <Field
        label={info.codeLabel}
        value={code}
        onChangeText={setCode}
        autoCapitalize="characters"
        autoCorrect={false}
      />
      <Text style={font.small}>{info.codeHint}</Text>
      <ErrorText text={error} />
      <Button
        title="Create account"
        onPress={submit}
        loading={busy}
        disabled={!name.trim() || !email || !password || !code}
      />
    </View>
  );
}

const styles = StyleSheet.create({
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
