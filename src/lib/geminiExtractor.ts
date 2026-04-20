import { GoogleGenerativeAI } from "@google/generative-ai";

export async function extractDueDateFromPdf(file: File): Promise<string | null> {
  try {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
    if (!apiKey) {
      console.warn("Gemini API Key is missing. Skipping date extraction.");
      return null;
    }
    
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    
    const base64 = await fileToBase64(file);
    
    const result = await model.generateContent([
      {
        inlineData: {
          data: base64,
          mimeType: file.type,
        },
      },
      "Extract the due date (Data de Vencimento) from this document. Return only the date in YYYY-MM-DD format. If not found, return 'NOT_FOUND'.",
    ]);

    const response = await result.response;
    const text = response.text().trim();
    
    if (text === "NOT_FOUND") return null;
    
    // Validate format YYYY-MM-DD
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (dateRegex.test(text)) {
      return text;
    }
    
    return null;
  } catch (error) {
    console.error("Error extracting due date:", error);
    return null;
  }
}

export async function parseItauStatement(text: string): Promise<any[]> {
  try {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
    if (!apiKey) {
      console.warn("Gemini API Key is missing. Skipping statement parsing.");
      return [];
    }
    
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ 
      model: "gemini-1.5-flash",
      generationConfig: {
        responseMimeType: "application/json"
      }
    });
    
    const prompt = `Você é um especialista financeiro. Extraia uma lista de transações bancárias do seguinte texto copiado do extrato do Itaú. 
    Muitas vezes esses dados vêm como linhas de texto onde cada linha ou conjunto de linhas representa uma transação.
    
    FORMATO DE SAÍDA: JSON (um array de objetos)
    CAMPOS POR OBJETO:
    - date: string (formato ISO YYYY-MM-DD)
    - description: string (descrição da transação)
    - amount: number (VALOR NUMÉRICO. Positivo para ENTRADAS/CRÉDITOS, Negativo para SAÍDAS/DÉBITOS. Remova 'R$', pontos de milhar e use ponto para decimais)
    - doc_number: string (número do documento se disponível, senão string vazia)
    
    TEXTO PARA PROCESSAR:
    ${text}
    
    Retorne APENAS o JSON válido. Se não encontrar transações, retorne um array vazio [].`;
    
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const jsonText = response.text();
    
    const parsed = JSON.parse(jsonText || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error("Error parsing Itaú statement:", error);
    return [];
  }
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const base64 = (reader.result as string).split(",")[1];
      resolve(base64);
    };
    reader.onerror = (error) => reject(error);
  });
}
