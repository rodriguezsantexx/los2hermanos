export default function OfflinePage() {
  return (
    <div className="flex flex-col items-center justify-center h-full p-8 text-center">
      <div className="text-6xl mb-4">📡</div>
      <h1 className="text-2xl font-bold mb-2">Sin conexión</h1>
      <p className="text-muted-foreground">
        No tenés conexión a internet en este momento. Revisá tu conexión e
        intentá de nuevo.
      </p>
    </div>
  );
}