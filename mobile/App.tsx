import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView } from 'react-native';
import { theme } from './src/theme';

export default function App() {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <StatusBar style="dark" />
      
      <View style={styles.header}>
        <Text style={theme.typography.h1}>Chofer</Text>
        <Text style={[theme.typography.caption, { color: theme.colors.primary }]}>La Falda</Text>
      </View>

      <View style={styles.card}>
        <Text style={theme.typography.h2}>Generado Hoy</Text>
        <Text style={[theme.typography.h1, { marginTop: 8 }]}>$180.000</Text>
        
        <View style={styles.row}>
          <View style={styles.badgeSuccess}>
            <Text style={styles.badgeTextSuccess}>🚚 10 Entregas</Text>
          </View>
          <View style={styles.badgeWarning}>
            <Text style={styles.badgeTextWarning}>📦 3 Pendientes</Text>
          </View>
        </View>
      </View>

      <View style={{ marginTop: theme.spacing.xl, gap: theme.spacing.md }}>
        <Text style={theme.typography.h2}>Acciones Rápidas</Text>
        
        <TouchableOpacity style={styles.btnPrimary} activeOpacity={0.8}>
          <Text style={styles.btnPrimaryText}>Ver Mis Pedidos</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.btnSecondary} activeOpacity={0.8}>
          <Text style={styles.btnSecondaryText}>Cerrar Turno</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    padding: theme.spacing.lg,
    paddingTop: 80,
    paddingBottom: 40,
  },
  header: {
    marginBottom: theme.spacing.xl,
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: 20,
    padding: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 3,
  },
  row: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.md,
  },
  badgeSuccess: {
    backgroundColor: '#D1FAE5',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  badgeTextSuccess: {
    color: '#065F46',
    fontWeight: 'bold',
    fontSize: 12,
  },
  badgeWarning: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  badgeTextWarning: {
    color: '#92400E',
    fontWeight: 'bold',
    fontSize: 12,
  },
  btnPrimary: {
    backgroundColor: theme.colors.primary,
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  btnPrimaryText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  btnSecondary: {
    backgroundColor: theme.colors.accent,
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
  },
  btnSecondaryText: {
    color: '#111827',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
