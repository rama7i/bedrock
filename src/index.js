// src/index.js with improved metadata debugging
const express = require('express');
const path = require('path');
const { BedrockAgentRuntimeClient, RetrieveCommand } = require('@aws-sdk/client-bedrock-agent-runtime');
const { BedrockRuntimeClient, InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// Set up AWS credentials from environment variables
const bedrockAgentClient = new BedrockAgentRuntimeClient({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  }
});

// Bedrock Runtime client for invoking the LLM
const bedrockRuntimeClient = new BedrockRuntimeClient({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  }
});

// Middleware
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Define available metadata options based on your document structure
const metadataOptions = {
  Subject: ["Arabic", "English", "Math", "Science"],
  Grade: ["KG1", "KG2"],
  Unit: [4, 5]
};

// API endpoint to get metadata filter options
app.get('/api/metadata-options', (req, res) => {
  res.json(metadataOptions);
});

// Function to deeply examine an object for metadata
function findMetadataInObject(obj, path = []) {
  const results = [];

  if (!obj || typeof obj !== 'object') return results;

  // Check if this object has a metadataAttributes property
  if (obj.metadataAttributes) {
    results.push({
      path: [...path, 'metadataAttributes'].join('.'),
      value: obj.metadataAttributes
    });
  }

  // Look for any property that might contain metadata
  for (const [key, value] of Object.entries(obj)) {
    if (key.toLowerCase().includes('metadata') && value && typeof value === 'object') {
      results.push({
        path: [...path, key].join('.'),
        value: value
      });
    }

    // Recursively check nested objects
    if (value && typeof value === 'object') {
      const nestedResults = findMetadataInObject(value, [...path, key]);
      results.push(...nestedResults);
    }
  }

  return results;
}

// API endpoint for querying knowledge base and getting LLM response
app.post('/api/query', async (req, res) => {
  try {
    const { knowledgeBaseId, query, metadataFilters = [], modelId = 'anthropic.claude-3-haiku-20240307-v1:0' } = req.body;

    if (!knowledgeBaseId || !query) {
      return res.status(400).json({ error: 'Knowledge base ID and query are required' });
    }

    // Create retrieval parameters
    let retrieveParams = {
      knowledgeBaseId,
      retrievalQuery: {
        text: query
      },
      nextToken: null,
      maxResults: 10 // Increase max results to ensure we get enough after filtering
    };

    // Group filters by key for post-processing
    const filtersByKey = {};
    metadataFilters.forEach(filter => {
      if (!filtersByKey[filter.key]) {
        filtersByKey[filter.key] = [];
      }
      filtersByKey[filter.key].push(filter.value);
    });

    // Configure Bedrock's filtering if needed
    if (Object.keys(filtersByKey).length > 0) {
      const andConditions = [];

      // For each key, create an OR condition for its values
      for (const [key, values] of Object.entries(filtersByKey)) {
        if (values.length === 1) {
          // Single value - simple equals condition
          andConditions.push({
            equals: {
              key: key,
              value: { stringValue: values[0].toString() }
            }
          });
        } else if (values.length > 1) {
          // Multiple values for same key - OR condition
          const orConditions = values.map(value => ({
            equals: {
              key: key,
              value: { stringValue: value.toString() }
            }
          }));

          // Add the OR group as one AND condition
          andConditions.push({
            orAll: orConditions
          });
        }
      }

      // Apply the combined AND filter
      if (andConditions.length > 0) {
        retrieveParams.retrievalQuery.filter = {
          andAll: andConditions
        };
      }
    }

    console.log("Query parameters:", JSON.stringify(retrieveParams, null, 2));

    // Execute the query using the correct client and command
    const command = new RetrieveCommand(retrieveParams);
    const kbResult = await bedrockAgentClient.send(command);

    console.log(`Got ${kbResult.retrievalResults?.length || 0} results from Bedrock`);

    // Deeply debug the response structure
    console.log("Full KB response:", JSON.stringify(kbResult, null, 2));

    // Extract and log the full structure of the first result if available
    if (kbResult.retrievalResults && kbResult.retrievalResults.length > 0) {
      console.log("First result full structure:", JSON.stringify(kbResult.retrievalResults[0], null, 2));

      // Scan for potential metadata throughout the result object
      const metadataLocations = findMetadataInObject(kbResult.retrievalResults[0]);
      console.log("Potential metadata locations found:", metadataLocations);
    }

    // Check if we have a custom location or structure for metadata
    let metadataLocation = null;
    let customMetadataMappings = {};

    if (kbResult.retrievalResults && kbResult.retrievalResults.length > 0) {
      const firstResult = kbResult.retrievalResults[0];
      const foundMetadata = findMetadataInObject(firstResult);

      if (foundMetadata.length > 0) {
        metadataLocation = foundMetadata[0].path;
        console.log(`Found metadata at path: ${metadataLocation}`);
      }

      // Check for document attributes that might contain metadata
      if (firstResult.documentAttributes) {
        console.log("Document attributes found:", firstResult.documentAttributes);
        customMetadataMappings.documentAttributes = true;
      }

      // Check for location attributes
      if (firstResult.location) {
        console.log("Location information found:", firstResult.location);
        customMetadataMappings.location = true;
      }
    }

    // Apply our filtering logic with enhanced debugging
    let filteredResults = [];
    let discardedResults = [];
    let foundAnyMetadata = false;

    // Only apply post-filtering if we have filters and results
    if (kbResult.retrievalResults && kbResult.retrievalResults.length > 0 && Object.keys(filtersByKey).length > 0) {
      kbResult.retrievalResults.forEach(result => {
        // Extract metadata from the result
        let resultMetadata = {};
        let metadataSource = "Not found";

        // Check for metadata in different possible locations
        if (result.metadata && result.metadata.metadataAttributes) {
          resultMetadata = result.metadata.metadataAttributes;
          metadataSource = "Standard path: metadata.metadataAttributes";
          foundAnyMetadata = true;
        } else if (result.documentAttributes) {
          resultMetadata = result.documentAttributes;
          metadataSource = "Document attributes";
          foundAnyMetadata = true;
        } else if (result.location) {
          resultMetadata = result.location;
          metadataSource = "Location information";
          foundAnyMetadata = true;
        }

        // Map AWS Bedrock metadata keys to our filter keys
        const metadataMapping = {
          'x-amz-bedrock-kb-source-uri': 'Subject',
          'x-amz-bedrock-kb-document-page-number': 'Page',
          'x-amz-bedrock-kb-data-source-id': 'SourceId'
        };

        // Extract metadata from AWS Bedrock format
        if (result.metadata) {
          for (const [key, value] of Object.entries(result.metadata)) {
            if (metadataMapping[key]) {
              // Extract metadata from the S3 URI
              if (key === 'x-amz-bedrock-kb-source-uri') {
                const uri = value.toString();
                
                // Extract Subject
                if (uri.includes('Arabic')) {
                  resultMetadata.Subject = 'Arabic';
                } else if (uri.includes('English')) {
                  resultMetadata.Subject = 'English';
                } else if (uri.includes('Math')) {
                  resultMetadata.Subject = 'Math';
                } else if (uri.includes('Science')) {
                  resultMetadata.Subject = 'Science';
                }

                // Extract Grade
                if (uri.includes('KG1')) {
                  resultMetadata.Grade = 'KG1';
                } else if (uri.includes('KG2')) {
                  resultMetadata.Grade = 'KG2';
                }

                // Extract Unit - handle both formats: "Unit 4" and "Unit4"
                const unitMatch = uri.match(/Unit[ _]?([45])/i);
                if (unitMatch && unitMatch[1]) {
                  resultMetadata.Unit = unitMatch[1];
                }
              }
            }
          }
        }

        if (Object.keys(resultMetadata).length > 0) {
          // Check if this result matches our filters
          let matches = true;
          let failureReason = null;

          for (const [key, allowedValues] of Object.entries(filtersByKey)) {
            // Convert both to string for comparison to handle numeric values
            const resultValue = resultMetadata[key]?.toString();

            // Check if property exists and has one of the allowed values
            if (!resultValue || !allowedValues.some(v => v.toString() === resultValue)) {
              matches = false;
              failureReason = `Failed to match filter: ${key}=${resultValue || 'undefined'}, allowed values: [${allowedValues.join(', ')}]`;
              break;
            }
          }

          if (matches) {
            filteredResults.push(result);
          } else {
            discardedResults.push({
              result,
              metadata: resultMetadata,
              source: metadataSource,
              reason: failureReason
            });
          }
        } else {
          discardedResults.push({
            result,
            reason: "No metadata found",
            inspectedPaths: [
              "metadata.metadataAttributes",
              "documentAttributes",
              "location"
            ]
          });
        }
      });
    } else if (kbResult.retrievalResults) {
      // If no filters specified, all results pass through
      filteredResults = kbResult.retrievalResults;
    }

    console.log(`After filtering: ${filteredResults.length} results matched, ${discardedResults.length} discarded`);
    console.log(`Found metadata in any results: ${foundAnyMetadata ? 'Yes' : 'No'}`);

    // Extract text content from filtered retrieval results
    const retrievedTexts = filteredResults.map(result => result.content.text);

    // Prepare context for LLM from retrieved texts
    const context = retrievedTexts.join('\n\n');

    // Prepare prompt for the LLM - using Arabic instructions
    let promptText = '';

    // Check which model we're using and format accordingly
    if (modelId.includes('anthropic.claude')) {
      // Claude prompt format - with Arabic instructions
      promptText = `<context>
${context}
</context>

استنادًا إلى السياق أعلاه، يرجى الإجابة على السؤال التالي: ${query}

تأكد من أن إجابتك تعتمد فقط على المعلومات الموجودة في السياق. إذا كان السياق لا يحتوي على معلومات كافية للإجابة على السؤال، فيرجى الإشارة إلى ذلك بوضوح.`;
    } else if (modelId.includes('amazon.titan')) {
      // Titan prompt format - with Arabic instructions
      promptText = `السياق:
${context}

السؤال: ${query}

الإجابة:`;
    } else {
      // Default format for other models - with Arabic instructions
      promptText = `أنت مساعد مفيد. استخدم المعلومات التالية للإجابة على سؤال المستخدم.

معلومات السياق:
${context}

سؤال المستخدم: ${query}`;
    }

    // Prepare the LLM request based on the model
    let llmResponse;
    try {
      // Only attempt to get LLM response if we have filtered results
      if (filteredResults.length > 0) {
        let llmRequestParams;

        if (modelId.includes('anthropic.claude')) {
          llmRequestParams = {
            modelId: modelId,
            contentType: 'application/json',
            accept: 'application/json',
            body: JSON.stringify({
              anthropic_version: "bedrock-2023-05-31",
              max_tokens: 3000,
              temperature: 0.1,
              system: "أنت مساعد مفيد يجيب على الأسئلة بناءً على السياق المقدم فقط. أجب باللغة العربية.",
              messages: [
                {
                  "role": "user",
                  "content": promptText
                }
              ]
            })
          };
        } else {
          // Generic request format for other models
          llmRequestParams = {
            modelId: modelId,
            contentType: 'application/json',
            accept: 'application/json',
            body: JSON.stringify({
              prompt: promptText,
              max_tokens: 3000,
              temperature: 0.1,
              top_p: 0.9
            })
          };
        }

        const llmCommand = new InvokeModelCommand(llmRequestParams);
        const rawResponse = await bedrockRuntimeClient.send(llmCommand);

        // Parse the response based on the model type
        const responseBody = JSON.parse(new TextDecoder().decode(rawResponse.body));

        if (modelId.includes('anthropic.claude')) {
          llmResponse = responseBody.content[0].text;
        } else {
          llmResponse = responseBody.completion || responseBody.generated_text || JSON.stringify(responseBody);
        }
      } else {
        llmResponse = "لم يتم العثور على نتائج متطابقة مع الفلاتر المحددة. لذلك لا يمكن تقديم إجابة.";
      }
    } catch (llmError) {
      console.error('Error invoking LLM:', llmError);
      llmResponse = "خطأ: تعذر إنشاء استجابة من النموذج اللغوي. " + llmError.message;
    }

    // Create a modified result with the filtered results
    const modifiedResult = {...kbResult, retrievalResults: filteredResults};

    // Return enhanced response with debugging info
    res.json({
      kbResults: modifiedResult,
      llmResponse: llmResponse,
      appliedFilters: filtersByKey,
      originalResultCount: kbResult.retrievalResults?.length || 0,
      filteredResultCount: filteredResults.length,
      metadataDebug: {
        foundAnyMetadata,
        metadataLocation: metadataLocation || "Not found",
        customStructures: Object.keys(customMetadataMappings),
      },
      unfiltered: filteredResults.length === 0 ? kbResult.retrievalResults || [] : [],
      discardReasons: discardedResults
    });
  } catch (error) {
    console.error('Error processing request:', error);
    res.status(500).json({ error: error.message });
  }
});

// Start server
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
}); 