import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useAuth } from "../context/AuthContext";
import { api } from "../api/client";
import { socket } from "../api/socket";
import type { ChatMessage } from "../types";

/**
 * One conversation view, reused for every chat "kind" (parent group,
 * parent<->driver, driver/parent<->admin). Student<->student chat is
 * deliberately not offered anywhere in the nav — cut per the earlier plan.
 */
export function ChatScreen({ conversationId }: { conversationId: string }) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    api
      .getMessages(conversationId)
      .then((m) => setMessages(m as ChatMessage[]))
      .catch(() => {});

    socket.connect();
    socket.emit("chat:join", { conversationId });
    socket.on("chat:message", (msg: ChatMessage) => {
      if (msg.conversationId === conversationId) {
        setMessages((prev) => [...prev, msg]);
      }
    });
    return () => {
      socket.off("chat:message");
    };
  }, [conversationId]);

  async function send() {
    if (!draft.trim() || !user) return;
    const msg = await api.sendMessage(conversationId, {
      senderId: user.id,
      senderRole: user.role,
      body: draft.trim(),
    });
    socket.emit("chat:message", msg);
    setDraft("");
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <FlatList
        data={messages}
        keyExtractor={(m) => m.id}
        renderItem={({ item }) => (
          <View
            style={[
              styles.bubble,
              item.senderId === user?.id && styles.bubbleMine,
            ]}
          >
            <Text style={styles.sender}>{item.senderRole}</Text>
            <Text>{item.body}</Text>
          </View>
        )}
      />
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={draft}
          onChangeText={setDraft}
          placeholder="Message"
        />
        <Pressable style={styles.sendButton} onPress={send}>
          <Text style={styles.sendButtonText}>Send</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 12 },
  bubble: {
    backgroundColor: "#f3f4f6",
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
    alignSelf: "flex-start",
    maxWidth: "80%",
  },
  bubbleMine: { backgroundColor: "#dbeafe", alignSelf: "flex-end" },
  sender: { fontSize: 11, color: "#666", marginBottom: 2 },
  inputRow: { flexDirection: "row", gap: 8, marginTop: 8 },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  sendButton: {
    backgroundColor: "#2563eb",
    borderRadius: 20,
    paddingHorizontal: 16,
    justifyContent: "center",
  },
  sendButtonText: { color: "#fff", fontWeight: "600" },
});
