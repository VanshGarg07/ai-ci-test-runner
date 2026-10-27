const { GoogleGenerativeAI } = require('@google/generative-ai');

async function analyzeErrors(errors, logs, apiKey, failedRequests = []) {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite' });
  const prompt = `
Analyze the following front-end runtime errors and console logs collected from a headless browser audit.
Provide a direct, concise technical diagnostic mapping out why the failure happened and the exact code patch required.
Do not include conversational filler, marketing text, or vague assumptions.

ERRORS DETECTED:
${JSON.stringify(errors, null, 2)}

CONSOLE LOGS:
${JSON.stringify(logs, null, 2)}

FAILED NETWORK REQUESTS:
${JSON.stringify(failedRequests.slice(0, 20), null, 2)}
`;
  const result = await model.generateContent(prompt);
  return result.response.text();
}

module.exports = { analyzeErrors };
