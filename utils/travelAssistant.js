const ExpressError = require("./expressError");

const endpoint = "https://api.openai.com/v1/chat/completions";
const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
const timeoutMs = 15_000;

const requestStructured = async (messages, name, schema) => {
    if (!process.env.OPENAI_API_KEY) {
        throw new ExpressError(503, "The Travel Assistant is not configured yet. Set OPENAI_API_KEY to enable it.");
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
        response = await fetch(endpoint, {
            method: "POST",
            signal: controller.signal,
            headers: {
                Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model,
                temperature: 0.2,
                max_tokens: 700,
                messages,
                response_format: {
                    type: "json_schema",
                    json_schema: { name, strict: true, schema }
                }
            })
        });
    } catch (error) {
        if (error.name === "AbortError") throw new ExpressError(504, "The Travel Assistant took too long to respond. Please try again.");
        throw new ExpressError(502, "The Travel Assistant could not connect to its AI provider.");
    } finally {
        clearTimeout(timeout);
    }
    if (!response.ok) {
        if (response.status === 429) throw new ExpressError(503, "The Travel Assistant is busy. Please try again shortly.");
        console.error("OpenAI assistant request failed with status", response.status);
        throw new ExpressError(502, "The Travel Assistant is temporarily unavailable.");
    }
    const payload = await response.json();
    const content = payload.choices?.[0]?.message?.content;
    if (typeof content !== "string") throw new ExpressError(502, "The Travel Assistant returned an invalid response.");
    try {
        return JSON.parse(content);
    } catch {
        throw new ExpressError(502, "The Travel Assistant returned an invalid response.");
    }
};

module.exports.extractPreferences = (query) => requestStructured([
    {
        role: "system",
        content: "Extract only travel preferences explicitly stated or safely implied by the user. Never invent a precise location or budget. Use null when absent. Return queryTerms as short neutral destination/property search words; do not answer the travel request."
    },
    { role: "user", content: query }
], "travel_preferences", {
    type: "object",
    properties: {
        location: { type: ["string", "null"] },
        maxPrice: { type: ["number", "null"] },
        guests: { type: ["integer", "null"] },
        propertyType: { type: ["string", "null"] },
        queryTerms: { type: ["string", "null"] },
        preference: { type: ["string", "null"] }
    },
    required: ["location", "maxPrice", "guests", "propertyType", "queryTerms", "preference"],
    additionalProperties: false
});

module.exports.explainMatches = (query, preferences, candidates) => {
    const allowedIds = candidates.map((listing) => String(listing._id));
    return requestStructured([
        {
            role: "system",
            content: "Recommend only supplied listing IDs. Never invent stays, amenities, availability, or facts. If none fit, return no recommendations. Keep each reason brief and grounded in supplied fields."
        },
        {
            role: "user",
            content: JSON.stringify({
                request: query,
                extractedPreferences: preferences,
                actualDatabaseListings: candidates.map((listing) => ({
                    id: String(listing._id),
                    title: listing.title,
                    location: listing.location,
                    country: listing.country,
                    pricePerNight: listing.price,
                    propertyType: listing.propertyType,
                    maximumGuests: listing.maximumGuests,
                    amenities: listing.amenities
                }))
            })
        }
    ], "travel_recommendations", {
        type: "object",
        properties: {
            message: { type: "string" },
            recommendations: {
                type: "array",
                items: {
                    type: "object",
                    properties: {
                        listingId: { type: "string", enum: allowedIds },
                        reason: { type: "string" }
                    },
                    required: ["listingId", "reason"],
                    additionalProperties: false
                }
            }
        },
        required: ["message", "recommendations"],
        additionalProperties: false
    });
};
