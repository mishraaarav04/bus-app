import React, { useCallback, useEffect, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { FlatList, RefreshControl, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "../../api/client";
import { getSocket } from "../../api/socket";
import { Card, Empty, Row } from "../../components/ui";
import { useAlertsBadge } from "../../context/AlertsContext";
import { useT } from "../../i18n";
import { colors, font } from "../../theme";
import type { AppNotification } from "../../types";

/** The in-app inbox: everything the app has told this person, newest first. */
export function AlertsScreen() {
  const { t, locale } = useT();
  const { setUnread } = useAlertsBadge();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      setItems((await api.notifications()).items);
    } catch {
      /* keep what we have */
    } finally {
      setRefreshing(false);
    }
  }, []);

  // Opening the tab reads everything. The list keeps the "new" dots until you leave.
  useFocusEffect(
    useCallback(() => {
      void load();
      api
        .markNotificationsRead()
        .then(() => setUnread(0))
        .catch(() => {});
    }, [load, setUnread])
  );

  useEffect(() => {
    const socket = getSocket();
    const onNew = (n: AppNotification) => setItems((prev) => [n, ...prev.filter((x) => x.id !== n.id)]);
    socket?.on("notification:new", onNew);
    return () => {
      socket?.off("notification:new", onNew);
    };
  }, []);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }} edges={["top"]}>
      <Text style={[font.title, { padding: 20, paddingBottom: 8 }]} accessibilityRole="header">
        {t("alerts.title")}
      </Text>
      <FlatList
        data={items}
        keyExtractor={(n) => n.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} tintColor={colors.primary} />}
        contentContainerStyle={{ padding: 20, paddingTop: 8, gap: 10, flexGrow: 1 }}
        ListEmptyComponent={<Empty title={t("alerts.none")} hint={t("alerts.noneHint")} />}
        renderItem={({ item }) => (
          <Card>
            <Row style={{ alignItems: "flex-start" }}>
              {!item.readAt ? (
                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary, marginTop: 6 }} />
              ) : null}
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={font.h3}>{item.title}</Text>
                <Text style={font.body}>{item.body}</Text>
                <Text style={font.small}>
                  {new Date(item.createdAt).toLocaleString(locale, { weekday: "short", hour: "numeric", minute: "2-digit" })}
                </Text>
              </View>
            </Row>
          </Card>
        )}
      />
    </SafeAreaView>
  );
}
