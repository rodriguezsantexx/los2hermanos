import readline from 'readline';

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const TELEFONO_PRUEBA = '5491100000000@s.whatsapp.net';

console.log('====================================');
console.log(' SIMULADOR DE CHAT BOT LOS 2 HERMANOS');
console.log(' Escribe tu mensaje y presiona Enter.');
console.log(' Escribe "salir" para terminar.');
console.log(' IMPORTANTE: Asegúrate de tener el bot principal corriendo en otra terminal.');
console.log('====================================\n');

const prompt = () => {
    rl.question('\nTú: ', async (mensaje) => {
        if (mensaje.toLowerCase() === 'salir' || mensaje.toLowerCase() === 'exit') {
            console.log('Saliendo del simulador...');
            rl.close();
            return;
        }

        if (!mensaje.trim()) {
            return prompt();
        }

        try {
            const response = await fetch('http://localhost:3005/api/simulate-message', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    telefono: TELEFONO_PRUEBA,
                    mensaje: mensaje
                })
            });
            
            const data = await response.json();
            
            if (data.reply) {
                console.log(`\n🤖 Bot: ${data.reply}`);
            } else {
                console.log('\n❌ [Error]:', data.error || data);
            }
        } catch (err) {
            console.error('\n❌ [Error de conexión]: No se pudo contactar al servidor. Asegúrate de que el bot esté corriendo en otra terminal (npm run dev).');
        }

        prompt();
    });
};

prompt();
