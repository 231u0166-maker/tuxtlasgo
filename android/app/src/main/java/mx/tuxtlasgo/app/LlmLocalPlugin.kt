package mx.tuxtlasgo.app

import android.util.Log
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.google.ai.edge.litertlm.Backend
import com.google.ai.edge.litertlm.Content
import com.google.ai.edge.litertlm.Conversation
import com.google.ai.edge.litertlm.Engine
import com.google.ai.edge.litertlm.EngineConfig
import com.google.ai.edge.litertlm.Message
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import java.io.File

// ============================================================
// PLUGIN NATIVO - LLM local via LiteRT-LM (Gemma)
// ============================================================
// Este es el "tercer generador": el mismo rol que juegan
// responderConLLMStream() (WebLLM local) y responderConNube() (Groq)
// en src/lib/llm.ts, pero corriendo en codigo Kotlin nativo, FUERA
// del motor de Chrome - sin el limite de 128MB de buffer de WebGPU
// ni el techo de ~300MB de memoria contigua de WebAssembly que
// documentamos como la causa real de los choques en Android.
//
// El texto que entra y sale de aqui ya viene armado por
// recuperarContexto()/armarMensajesLLM() del lado de JS - este plugin
// SOLO redacta, igual que WebLLM y la nube. La validacion
// anti-alucinacion (pareceInventada) se sigue aplicando del lado de
// JS antes de mostrar cualquier respuesta al turista.
// ============================================================

@CapacitorPlugin(name = "LlmLocal")
class LlmLocalPlugin : Plugin() {

    private var engine: Engine? = null
    private var conversation: Conversation? = null
    private val scope = CoroutineScope(Dispatchers.IO)

    companion object {
        private const val TAG = "LlmLocalPlugin"
        // Ruta donde se espera el modelo .litertlm ya descargado.
        // TODO: conectar con la descarga real mas adelante.
        private const val NOMBRE_MODELO = "gemma3-1b-it.litertlm"
    }

    // --------------- Esta listo? ---------------
    @PluginMethod
    fun estaListo(call: PluginCall) {
        val ret = JSObject()
        ret.put("listo", engine != null && conversation != null)
        call.resolve(ret)
    }

    // --------------- Inicializacion (carga el modelo a memoria) ---------------
    @PluginMethod
    fun inicializar(call: PluginCall) {
        // TEMPORAL para el spike: /data/local/tmp/ es una carpeta pública
        // donde adb push funciona sin pedir permisos especiales. Cuando
        // conectemos la descarga real más adelante, esto vuelve a apuntar
        // a context.filesDir (almacenamiento privado de la app).
        val archivoModelo = File("/data/local/tmp/$NOMBRE_MODELO")
        if (!archivoModelo.exists()) {
            call.reject("MODELO_NO_DESCARGADO: no se encontro $NOMBRE_MODELO en almacenamiento de la app")
            return
        }

        scope.launch {
            try {
                val config = EngineConfig(
                    modelPath = archivoModelo.absolutePath,
                    backend = Backend.GPU()
                )
                val nuevoEngine = Engine(config)
                nuevoEngine.initialize()
                engine = nuevoEngine
                conversation = nuevoEngine.createConversation()

                val ret = JSObject()
                ret.put("listo", true)
                call.resolve(ret)
            } catch (e: Exception) {
                Log.e(TAG, "Fallo al inicializar LiteRT-LM", e)
                call.reject("ERROR_INICIALIZAR: ${e.message}", e)
            }
        }
    }

    // --------------- Generacion ---------------
    @PluginMethod
    fun generar(call: PluginCall) {
        val conv = conversation
        if (conv == null) {
            call.reject("LLM_NO_INICIALIZADO")
            return
        }

        val systemPrompt = call.getString("systemPrompt") ?: ""
        val mensajesArray = call.getArray("mensajes")
        if (mensajesArray == null) {
            call.reject("FALTAN_MENSAJES")
            return
        }

        val builder = StringBuilder()
        builder.append(systemPrompt).append("\n\n")
        for (i in 0 until mensajesArray.length()) {
            val m = mensajesArray.getJSONObject(i)
            val role = m.getString("role")
            val content = m.getString("content")
            builder.append(if (role == "user") "Usuario: " else "Asistente: ")
            builder.append(content).append("\n")
        }

        scope.launch {
            try {
                val respuesta = conv.sendMessage(Message.of(builder.toString()))
                val ret = JSObject()
                ret.put("texto", respuesta.toString())
                call.resolve(ret)
            } catch (e: Exception) {
                Log.e(TAG, "Fallo al generar respuesta", e)
                call.reject("ERROR_GENERAR: ${e.message}", e)
            }
        }
    }

    // --------------- Limpieza ---------------
    @PluginMethod
    fun liberar(call: PluginCall) {
        engine?.close()
        engine = null
        conversation = null
        call.resolve()
    }
}