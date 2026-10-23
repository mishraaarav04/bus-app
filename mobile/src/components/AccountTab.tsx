import React, { useEffect, useState } from "react";
import { Alert, ScrollView, Share, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { colors, font } from "../theme";
import { Avatar, Button, Card, ErrorText, Field, Pill, Row } from "./ui";

const ROLE_LABEL = {
  student: "Student",
  parent: "Parent",
  driver: "Driver",
  company: "Bus company",
  admin: "School",
} as const;

function CodeCard({ title, hint, code, onRotate }: { title: string; hint: string; code: string; onRotate?: () => void }) {
  return (
    <Card>
      <Text style={font.h3}>{title}</Text>
      <Text style={{ fontSize: 28, fontWeight: "900", letterSpacing: 2, color: colors.primaryDark }} selectable>
        {code}
      </Text>
      <Text style={font.small}>{hint}</Text>
      <Row>
        <Button
          title="Share"
          variant="soft"
          style={{ flex: 1 }}
          onPress={() => Share.share({ message: `Join me on Wheelie with code ${code}` })}
        />
        {onRotate ? <Button title="New code" variant="outline" style={{ flex: 1 }} onPress={onRotate} /> : null}
      </Row>
    </Card>
  );
}

function ChangePassword() {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setError(null);
    setBusy(true);
    try {
      await api.changePassword(current, next);
      setOpen(false);
      setCurrent("");
      setNext("");
      Alert.alert("Password changed");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (!open) return <Button title="Change password" variant="outline" onPress={() => setOpen(true)} />;
  return (
    <Card>
      <Text style={font.h3}>Change password</Text>
      <Field label="Current password" value={current} onChangeText={setCurrent} secureTextEntry autoCapitalize="none" />
      <Field label="New password" value={next} onChangeText={setNext} secureTextEntry autoCapitalize="none" />
      <Text style={font.small}>At least 8 characters with a letter and a number.</Text>
      <ErrorText text={error} />
      <Row>
        <Button title="Cancel" variant="outline" style={{ flex: 1 }} onPress={() => setOpen(false)} />
        <Button title="Save" style={{ flex: 1 }} onPress={save} loading={busy} disabled={!current || !next} />
      </Row>
    </Card>
  );
}

export function AccountTab() {
  const { user, signOut, refreshUser } = useAuth();
  const [kids, setKids] = useState<{ id: string; name: string }[]>([]);
  const [childCode, setChildCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user?.role === "parent") api.parentChildren().then(setKids).catch(() => {});
  }, [user?.role, user?.linkedStudentIds?.length]);

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
    Alert.alert("Make a new code?", "Parents who already linked keep access. Only new links need the new code.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "New code",
        onPress: async () => {
          try {
            await api.rotateLinkCode();
            await refreshUser();
          } catch (e: any) {
            Alert.alert("Couldn't change code", e.message);
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
            <Pill text={ROLE_LABEL[user.role]} tone="orange" />
          </View>
        </Row>

        {user.role === "student" && user.linkCode ? (
          <CodeCard
            title="Your parent code"
            hint="Give this to a parent so they can follow your bus."
            code={user.linkCode}
            onRotate={rotate}
          />
        ) : null}
        {user.role === "company" && user.driverCode ? (
          <CodeCard title="Driver sign-up code" hint="New drivers enter this when they create their account." code={user.driverCode} />
        ) : null}
        {user.role === "admin" && user.studentCode ? (
          <CodeCard title="Student sign-up code" hint="Students enter this when they create their account." code={user.studentCode} />
        ) : null}

        {user.role === "parent" ? (
          <Card>
            <Text style={font.h3}>Your children</Text>
            {kids.map((k) => (
              <Row key={k.id}>
                <Avatar name={k.name} size={36} />
                <Text style={font.body}>{k.name}</Text>
              </Row>
            ))}
            <Field
              label="Link another child"
              value={childCode}
              onChangeText={setChildCode}
              placeholder="KID-XXXXXX"
              autoCapitalize="characters"
              autoCorrect={false}
            />
            <ErrorText text={error} />
            <Button title="Link child" variant="soft" onPress={linkChild} loading={busy} disabled={!childCode.trim()} />
          </Card>
        ) : null}

        <ChangePassword />
        <Button title="Sign out" variant="soft" onPress={signOut} />
      </ScrollView>
    </SafeAreaView>
  );
}
