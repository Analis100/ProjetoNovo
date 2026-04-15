// components/LockedOverlay.js
import React from "react";
import { View, Text, TouchableOpacity } from "react-native";

export default function LockedOverlay({ onPressAssinar }) {
  return (
    <View
      style={{
        ...StyleSheet.absoluteFillObject,
        backgroundColor: "rgba(0,0,0,0.5)",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <View
        style={{
          backgroundColor: "#fff",
          padding: 16,
          borderRadius: 12,
          width: "90%",
        }}
      >
        <Text style={{ fontSize: 16, fontWeight: "700", marginBottom: 8 }}>
          Recurso premium
        </Text>
        <Text style={{ fontSize: 14, marginBottom: 12 }}>
          Assine para desbloquear este recurso.
        </Text>
        <TouchableOpacity
          onPress={onPressAssinar}
          style={{ backgroundColor: "#111", padding: 12, borderRadius: 10 }}
        >
          <Text style={{ color: "#fff", textAlign: "center" }}>
            Assinar agora
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
