package mx.tuxtlasgo.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Registra el plugin nativo del LLM local (LiteRT-LM/Gemma) -
        // ver LlmLocalPlugin.kt. Es el "tercer generador" junto a
        // WebLLM (navegador) y la nube (Groq).
        registerPlugin(LlmLocalPlugin.class);
        super.onCreate(savedInstanceState);
    }
}