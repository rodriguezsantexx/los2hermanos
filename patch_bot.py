import sys

content = open("whatsapp/src/index.ts").read()

old_logic = """                        const backendData = await backendRes.json();
                        
                        if (backendData.mp_link) {"""

new_logic = """                        const backendData = await backendRes.json();
                        
                        if (!backendRes.ok) {
                            if (backendData.detail === "CERRADO_DOMINGO") {
                                replyText = "Lo siento, hoy domingo estamos cerrados. 😔 ¡Te esperamos mañana!";
                            } else if (backendData.detail === "CERRADO_DEPOSITO") {
                                replyText = "Lo siento, nuestro local se encuentra cerrado en este momento. Nuestro horario para retiros es de Lunes a Sábado de 09:00 a 21:00 hs.";
                            } else if (backendData.detail === "CERRADO_REPARTO") {
                                replyText = "Lo siento, actualmente no estamos en horario de reparto. 🛵 Nuestros horarios de envío son de Lunes a Sábado de 09:00 a 14:00 y de 17:00 a 20:30 hs.";
                            } else {
                                throw new Error("Error del backend: " + (backendData.detail || "Error desconocido"));
                            }
                        } else if (backendData.mp_link) {"""

content = content.replace(old_logic, new_logic)

with open("whatsapp/src/index.ts", "w") as f:
    f.write(content)

