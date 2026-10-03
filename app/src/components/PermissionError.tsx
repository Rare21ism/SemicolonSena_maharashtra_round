import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface PermissionErrorProps {
  message: string;
  onRetry?: () => void;
}

/**
 * Displayed in the live screen when microphone access fails.
 * Shows an actionable error message and an optional retry button.
 */
export const PermissionError: React.FC<PermissionErrorProps> = ({ message, onRetry }) => (
  <View style={styles.container}>
    <View style={styles.iconRow}>
      <Text style={styles.icon}>🎙️</Text>
    </View>
    <Text style={styles.title}>Microphone Unavailable</Text>
    <Text style={styles.message}>{message}</Text>
    {onRetry && (
      <TouchableOpacity style={styles.retryButton} onPress={onRetry}>
        <Text style={styles.retryText}>Try Again</Text>
      </TouchableOpacity>
    )}
    <Text style={styles.hint}>
      Captions from other devices will still appear below.
    </Text>
  </View>
);

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.35)',
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 16,
    marginTop: 8,
    alignItems: 'center',
  },
  iconRow: {
    marginBottom: 8,
  },
  icon: {
    fontSize: 28,
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FCA5A5',
    marginBottom: 6,
    textAlign: 'center',
  },
  message: {
    fontSize: 13,
    color: '#FEE2E2',
    textAlign: 'center',
    lineHeight: 18,
  },
  retryButton: {
    marginTop: 12,
    backgroundColor: 'rgba(239, 68, 68, 0.25)',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.4)',
  },
  retryText: {
    color: '#FCA5A5',
    fontWeight: '700',
    fontSize: 14,
  },
  hint: {
    marginTop: 10,
    fontSize: 11,
    color: '#94A3B8',
    textAlign: 'center',
  },
});
