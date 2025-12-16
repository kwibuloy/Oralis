    import express from "express";
    import cors from "cors";

    const app = express();
    const PORT = 3000;

    app.use(cors());
    app.use(express.json());

    const graphTraversal = {
        nodes: [
            { id: "Head", type: "bodyPart" },
            { id: "Torso", type: "bodyPart" },
            { id: "Arms", type: "bodyPart" },
            { id: "Legs", type: "bodyPart" },
            { id: "Migraine", type: "diagnosis", location: "Head" },
            { id: "Stroke", type: "diagnosis", location: "Head" },
            { id: "CardiacEvent", type: "diagnosis", location: "Torso" },
            { id: "AnxietyAttack", type: "diagnosis", location: "Torso" },
            { id: "MenstrualCramps", type: "diagnosis", location: "Torso" },
            { id: "NerveCompression", type: "diagnosis", location: "Arms" },
            { id: "DVT", type: "diagnosis", location: "Legs" }
        ],
        edges: [
            { 
                from: "Migraine", 
                to: "Torso", 
                type: "symptom_propagation",
                manifestedSymptoms: ["neck_stiffness", "muscle_tension"],
                description: "Migraines commonly cause neck stiffness and muscle tension in the upper back through the trigeminal nerve system.\n\n"
            },
            { 
                from: "Stroke", 
                to: "Arms", 
                type: "symptom_propagation",
                manifestedSymptoms: ["weakness", "numbness"],
                description: "When a stroke affects the motor cortex, it causes sudden weakness, numbness, or paralysis in the arms.\n\n"
            },
            { 
                from: "Stroke", 
                to: "Legs", 
                type: "symptom_propagation",
                manifestedSymptoms: ["weakness", "leg_pain"], 
                description: "Strokes can affect the motor cortex regions controlling leg movement, causing sudden weakness or paralysis.\n\n"
            },
            { 
                from: "CardiacEvent", 
                to: "Arms", 
                type: "symptom_propagation",
                manifestedSymptoms: ["sharp_pain", "numbness", "tingling"],
                description: "Cardiac-related chest pain often radiates to the arms (especially the left arm) through referred pain pathways.\n\n"
            },
            { 
                from: "MenstrualCramps", 
                to: "Legs", 
                type: "symptom_propagation",
                manifestedSymptoms: ["leg_pain", "muscle_cramps"],
                description: "Menstrual cramps can radiate to the lower back and thighs due to the proximity of pelvic nerves.\n\n"
            },
            { 
                from: "NerveCompression", 
                to: "Torso", 
                type: "symptom_propagation",
                manifestedSymptoms: ["back_pain", "shortness_of_breath"],
                description: "Nerve compression in the cervical spine can cause symptoms to radiate down from the neck/upper back.\n\n"
            },
            { 
                from: "DVT", 
                to: "Torso", 
                type: "symptom_propagation",
                manifestedSymptoms: ["shortness_of_breath", "chest_pain", "rapid_heartbeat"],
                description: "Deep Vein Thrombosis in the legs can lead to pulmonary embolism if the clot travels to the lungs. This connects leg issues to sudden chest symptoms.\n\n"
            }
        ]
    };


    function findDiagnosisConnections(diagnosisId) {
        return graphTraversal.edges.filter(edge => edge.from === diagnosisId);
    }

    function getAffectedBodyParts(diagnosisId) {
        const connections = findDiagnosisConnections(diagnosisId);
        return connections.map(edge => ({
            bodyPart: edge.to,
            description: edge.description
        }));
    }

    const humanBody = {
        Head: {
            symptoms: [
                { name: "severe_headache", keywords: ["severe headache", "intense headache", "bad headache", "terrible headache"] },
                { name: "throbbing_pain", keywords: ["throbbing", "pulsating", "pounding pain", "pounding headache"] },
                { name: "dizziness", keywords: ["dizzy", "dizziness", "lightheaded", "vertigo", "spinning"] },
                { name: "nausea", keywords: ["nausea", "nauseous", "feel sick", "queasy"] },
                { name: "light_sensitivity", keywords: ["light sensitivity", "photophobia", "bright lights hurt", "sensitive to light", "sensitivity to light"] },
                { name: "blurred_vision", keywords: ["blurred vision", "blurry", "can't see clearly", "vision problems"] },
                { name: "confusion", keywords: ["confused", "confusion", "disoriented", "can't think clearly"] },
                { name: "slurred_speech", keywords: ["slurred speech", "can't speak clearly", "trouble speaking"] }
            ],
            diagnoses: [
                {
                    id: "Migraine",
                    name: "Migraine",
                    mandatorySymptoms: ["severe_headache", "throbbing_pain"],
                    optionalSymptoms: ["nausea", "light_sensitivity", "dizziness", "blurred_vision"],
                    optionalMinimum: 1,
                    response: "You may be experiencing a MIGRAINE. Migraines are intense headaches characterized by throbbing pain, often on one side of the head. They typically last 4-72 hours and are accompanied by nausea and sensitivity to light or sound.\n\n"
                },
                {
                    id: "Stroke",
                    name: "Stroke Warning Signs",
                    mandatorySymptoms: ["severe_headache"],
                    optionalSymptoms: ["dizziness", "confusion", "slurred_speech", "blurred_vision"],
                    optionalMinimum: 2,
                    urgent: true,
                    response: "Your symptoms may indicate STROKE WARNING SIGNS. Strokes occur when blood flow to the brain is interrupted, causing brain cells to die rapidly. \n\n"
                }
            ]
        },
        Torso: {
            male: {
                symptoms: [
                    { name: "chest_pain", keywords: ["chest pain", "chest hurts", "chest discomfort", "pain in chest"] },
                    { name: "shortness_of_breath", keywords: ["shortness of breath", "can't breathe", "breathing difficulty", "hard to breathe"] },
                    { name: "rapid_heartbeat", keywords: ["rapid heartbeat", "heart racing", "palpitations", "fast heartbeat", "heart is racing fast"] },
                    { name: "sweating", keywords: ["sweating", "cold sweat", "sweaty", "perspiring"] },
                    { name: "back_pain", keywords: ["back pain", "back hurts", "pain in back", "backache"] }
                ],
                diagnoses: [
                    {
                        id: "CardiacEvent",
                        name: "Possible Cardiac Event",
                        mandatorySymptoms: ["chest_pain"],
                        optionalSymptoms: ["shortness_of_breath", "sweating", "rapid_heartbeat"],
                        optionalMinimum: 3,
                        urgent: true,
                        response: "Your symptoms may indicate a POSSIBLE CARDIAC EVENT. Chest pain combined with these symptoms requires immediate medical attention.\n\n"
                    },
                    {
                        id: "AnxietyAttack",
                        name: "Anxiety Attack",
                        mandatorySymptoms: ["shortness_of_breath"],
                        optionalSymptoms: ["rapid_heartbeat", "chest_pain", "sweating"],
                        optionalMinimum: 2,
                        response: "You may be experiencing an ANXIETY ATTACK. Panic attacks can cause intense physical symptoms including chest tightness, rapid heartbeat, and difficulty breathing. While frightening, they are not life-threatening.\n\n"
                    }
                ]
            },
            female: {
                symptoms: [
                    { name: "chest_pain", keywords: ["chest pain", "chest hurts", "chest discomfort", "pain in chest"] },
                    { name: "shortness_of_breath", keywords: ["shortness of breath", "can't breathe", "breathing difficulty", "hard to breathe"] },
                    { name: "rapid_heartbeat", keywords: ["rapid heartbeat", "heart is racing", "palpitations", "fast heartbeat"] },
                    { name: "sweating", keywords: ["sweating", "cold sweat", "sweaty", "perspiring"] },
                    { name: "back_pain", keywords: ["back pain", "back hurts", "pain in back", "backache"] },
                    { name: "menstrual_cramps", keywords: ["period cramps", "menstrual pain", "cramping", "menstrual cramps"] },
                    { name: "pelvic_pain", keywords: ["pelvic pain", "pain in pelvis"] },
                    { name: "swollen_boobs", keywords: ["boobs hurt", "boob hurt", "swollen boobs"]}
                ],
                diagnoses: [
                    {
                        id: "CardiacEvent",
                        name: "Possible Cardiac Event",
                        mandatorySymptoms: ["chest_pain"],
                        optionalSymptoms: ["shortness_of_breath", "sweating", "rapid_heartbeat"],
                        optionalMinimum: 3,
                        urgent: true,
                        response: "Your symptoms may indicate a POSSIBLE CARDIAC EVENT. Chest pain combined with these symptoms requires immediate medical attention.\n\n"
                    },
                    {
                        id: "AnxietyAttack",
                        name: "Anxiety Attack",
                        mandatorySymptoms: ["shortness_of_breath"],
                        optionalSymptoms: ["rapid_heartbeat", "chest_pain", "sweating"],
                        optionalMinimum: 2,
                        response: "You may be experiencing an ANXIETY ATTACK. Panic attacks can cause intense physical symptoms including chest tightness, rapid heartbeat, and difficulty breathing. While frightening, they are not life-threatening.\n\n"
                    },
                    {
                        id: "MenstrualCramps",
                        name: "Menstrual Cramps (Dysmenorrhea)",
                        mandatorySymptoms: ["menstrual_cramps", "pelvic_pain"],
                        optionalSymptoms: ["swollen_boobs", "back_pain"],
                        optionalMinimum: 1,
                        response: "You may be experiencing MENSTRUAL CRAMPS (Dysmenorrhea). This is common pain during menstruation caused by uterine contractions.\n\n"
                    }
                ]
            }
        },
        Arms: {
            symptoms: [
                { name: "numbness", keywords: ["numbness", "numb", "tingling", "pins and needles"] },
                { name: "weakness", keywords: ["weakness", "weak", "can't lift", "no strength"] },
                { name: "sharp_pain", keywords: ["sharp pain", "stabbing pain", "shooting pain"] }
            ],
            diagnoses: [
                {
                    id: "NerveCompression",
                    name: "Nerve Compression",
                    mandatorySymptoms: ["numbness"],
                    optionalSymptoms: ["weakness", "sharp_pain"],
                    optionalMinimum: 1,
                    response: "You may have NERVE COMPRESSION (such as carpal tunnel or cervical radiculopathy). This occurs when nerves are compressed or pinched, causing numbness, tingling, and weakness.\n\n"
                }
            ]
        },
        Legs: {
            symptoms: [
                { name: "muscle_cramps", keywords: ["muscle cramps", "cramps", "cramping", "muscle spasms"] },
                { name: "swelling", keywords: ["swelling", "swollen", "puffy", "edema"] },
                { name: "leg_pain", keywords: ["leg pain", "pain in leg", "leg hurts"] },
                { name: "warmth", keywords: ["warm", "warmth", "hot", "heat"] },
                { name: "redness", keywords: ["red", "redness", "discoloration"] }
            ],
            diagnoses: [
                {
                    id: "DVT",
                    name: "Deep Vein Thrombosis (DVT)",
                    mandatorySymptoms: ["swelling", "leg_pain"],
                    optionalSymptoms: ["warmth", "redness"],
                    optionalMinimum: 1,
                    urgent: true,
                    response: "Your symptoms may indicate DEEP VEIN THROMBOSIS (DVT). This is a blood clot in a deep vein, usually in the legs, which can be life-threatening if it travels to the lungs. \n\n"
                }
            ]
        }
    };

    const BODY_PART_MAP = {
        'LeftArm': 'Arms',
        'RightArm': 'Arms'
    };

    function normalizeBodyPart(bodyPart) {
        return BODY_PART_MAP[bodyPart] || bodyPart;
    }

    const conversationSessions = {};

    function getOrCreateSession(sessionId) {
        if (!conversationSessions[sessionId]) {
            conversationSessions[sessionId] = {
                selectedBodyPart: null,
                gender: null,
                accumulatedSymptoms: new Set(),
                messageHistory: []
            };
        }
        return conversationSessions[sessionId];
    }

    function getSymptomSet(bodyPart, gender) {
        const mappedBodyPart = normalizeBodyPart(bodyPart);
        
        if (mappedBodyPart === "Torso" && (gender === "male" || gender === "female")) {
            return humanBody[mappedBodyPart][gender].symptoms;
        }
        return humanBody[mappedBodyPart].symptoms;
    }

    function getDiagnosesList(bodyPart, gender) {
        const mappedBodyPart = normalizeBodyPart(bodyPart);
        
        if (mappedBodyPart === "Torso" && (gender === "male" || gender === "female")) {
            return humanBody[mappedBodyPart][gender].diagnoses;
        }
        return humanBody[mappedBodyPart].diagnoses; 
    }

    function extractSymptoms(userMessage, bodyPart, gender) {
        const symptomSet = getSymptomSet(bodyPart, gender);
        const extractedSymptoms = new Set();
        const messageLower = userMessage.toLowerCase().trim().replace(/[.,!?;:"_-]/g, ' ');
        const words = messageLower.split(/\s+/).filter(word => word.length > 0);
        
        for (const symptom of symptomSet) {
            for (const keyword of symptom.keywords) {
                const keywordLower = keyword.toLowerCase();
                const splitKeywords = keyword.toLowerCase().split(/\s+/);
                
                if (splitKeywords.length === 1) {
                    if (words.includes(splitKeywords[0])) {
                        extractedSymptoms.add(symptom.name);
                        break;
                    }
                } else {
                    if (messageLower.includes(keywordLower)) {
                        extractedSymptoms.add(symptom.name);
                        break;
                    }
                }
            }
        }
        return extractedSymptoms;
    }

    function extractAllSymptoms(userMessage, gender) {
        const allSymptoms = new Set();
        const messageLower = userMessage.toLowerCase().trim().replace(/[.,!?;:"_-]/g, ' ');
        const words = messageLower.split(/\s+/).filter(word => word.length > 0);
        
        const checkList = (symptomList) => {
            if (!symptomList) return;
            
            for (const symptom of symptomList) {
                for (const keyword of symptom.keywords) {
                    const keywordLower = keyword.toLowerCase();
                    const splitKeywords = keyword.toLowerCase().split(/\s+/);
                    
                    if (splitKeywords.length === 1) {
                        if (words.includes(splitKeywords[0])) {
                            allSymptoms.add(symptom.name);
                            break;
                        }
                    } else {
                        if (messageLower.includes(keywordLower)) {
                            allSymptoms.add(symptom.name);
                            break;
                        }
                    }
                }
            }
        };
        
        Object.keys(humanBody).forEach(part => {
            const partData = humanBody[part];
            
            if (partData.symptoms) {
                checkList(partData.symptoms);
            } else {
                if (partData.male && gender === 'male') checkList(partData.male.symptoms);
                if (partData.female && gender === 'female') checkList(partData.female.symptoms);
            }
        });
        
        return allSymptoms;
    }

    function findMatchingDiagnoses(bodyPart, gender, userSymptoms) {
        const diagnosesList = getDiagnosesList(bodyPart, gender);
        const matchedDiagnoses = [];
        
        for (const diagnosis of diagnosesList) {
            const mandatorySet = new Set(diagnosis.mandatorySymptoms);
            const optionalSet = new Set(diagnosis.optionalSymptoms);
            const hasMandatory = isSubset(mandatorySet, userSymptoms);
            
            if (hasMandatory) {
                const optionalMatches = setIntersection(userSymptoms, optionalSet);
                
                if (optionalMatches.size >= diagnosis.optionalMinimum) {
                    const allMatchedSymptoms = setUnion(mandatorySet, optionalMatches);
                    matchedDiagnoses.push({
                        diagnosis: diagnosis,
                        score: allMatchedSymptoms.size,
                        mandatoryMatched: [...mandatorySet],
                        optionalMatched: [...optionalMatches],
                        totalMatched: [...allMatchedSymptoms]
                    });
                }
            }
        }
        return matchedDiagnoses;
    }

    function setUnion(setA, setB) {
        const union = new Set(setA);
        for (const elem of setB) {
            union.add(elem);
        }
        return union;
    }

    function setIntersection(setA, setB) {
        const intersection = new Set();
        for (const elem of setA) {
            if (setB.has(elem)) {
                intersection.add(elem);
            }
        }
        return intersection;
    }

    function isSubset(setA, setB) {
        for (const elem of setA) {
            if (!setB.has(elem)) {
                return false;
            }
        }
        return true;
    }


    function findReferredDiagnoses(selectedBodyPart, localSymptoms, allSymptoms, gender) {
    const referredMatches = [];
    const normalizedSelected = normalizeBodyPart(selectedBodyPart);

    const incomingEdges = graphTraversal.edges.filter(edge => 
        normalizeBodyPart(edge.to) === normalizedSelected
    );

    incomingEdges.forEach(edge => {
        if (edge.manifestedSymptoms) {
            const intersection = edge.manifestedSymptoms.filter(s => allSymptoms.has(s));
            
            if (intersection.length > 1) {
                let originDiagnosis = null;
                let originBodyPart = null;

                for (const [bPart, data] of Object.entries(humanBody)) {
                    const diagnoses = [];
                    if (data.diagnoses) diagnoses.push(...data.diagnoses);
                    if (data.male && gender === 'male') diagnoses.push(...data.male.diagnoses);
                    if (data.female && gender === 'female') diagnoses.push(...data.female.diagnoses);

                    const found = diagnoses.find(d => d.id === edge.from);
                    if (found) {
                        originDiagnosis = found;
                        originBodyPart = bPart;
                        break;
                    }
                }

                if (originDiagnosis) {
                    const hasOriginSymptoms = originDiagnosis.mandatorySymptoms.some(s => allSymptoms.has(s)) ||
                                            originDiagnosis.optionalSymptoms.some(s => allSymptoms.has(s));
                    
                    const matchPercentage = intersection.length / edge.manifestedSymptoms.length;
                    const baseScore = originDiagnosis.urgent ? 100 : 50;
                    const finalScore = baseScore + (matchPercentage * 50); 
                    
                    referredMatches.push({
                        diagnosis: originDiagnosis,
                        originPart: originBodyPart,
                        triggerSymptoms: intersection,
                        description: edge.description,
                        isReferred: true,
                        hasOriginSymptoms: hasOriginSymptoms, 
                        score: finalScore
                    });
                }
            }
        }
    });

    return referredMatches;
}

    function rankByMatchScore(matchedDiagnoses) {
        const urgent = matchedDiagnoses.filter(item => item.diagnosis.urgent);
        const notUrgent = matchedDiagnoses.filter(item => !item.diagnosis.urgent);

        urgent.sort((a,b) => b.score - a.score);
        notUrgent.sort((a,b) => b.score - a.score);

        let topNotUrgent = [];
        if(notUrgent.length > 0){
            const highestScore = notUrgent[0].score;
            topNotUrgent = notUrgent.filter(item => item.score === highestScore);
        }
        return [...urgent, ...notUrgent];
    }

    function formatSymptoms(symptomsSet) {
        const symptomsArray = [...symptomsSet];
        return symptomsArray.map(s => s.replace(/_/g, ' ')).join(", ");
    }

    function buildResponse(rankedDiagnoses, extractedSymptoms, selectedBodyPart) {
        let response = "";

        const referredMatches = rankedDiagnoses.filter(d => d.isReferred);
        const localMatches = rankedDiagnoses.filter(d => !d.isReferred);
        
        const urgentDiagnoses = localMatches.filter(d => d.diagnosis.urgent);
        const nonUrgentDiagnoses = localMatches.filter(d => !d.diagnosis.urgent);
        
        if (referredMatches.length > 0) {
            response += `🔍 **IMPORTANT CONNECTION DETECTED:**\n\n`;
            
            referredMatches.forEach(match => {
                const symptomNames = match.triggerSymptoms.map(s => s.replace(/_/g, ' ')).join(", ");
                
                if (match.hasOriginSymptoms) {
                    response += `Your ${selectedBodyPart.toLowerCase()} symptom (${symptomNames}) combined with other symptoms you mentioned suggests **${match.diagnosis.name}**, which originates in the **${match.originPart}**.\n\n`;
                } else {
                    response += `Your ${selectedBodyPart.toLowerCase()} symptom (${symptomNames}) is a known warning sign for **${match.diagnosis.name}**, which typically originates in the **${match.originPart}**.\n\n`;
                }
                
                response += `${match.description}`;
                
                if (match.diagnosis.urgent) {
                    response += `⚠️ This is potentially URGENT. Please check your ${match.originPart.toLowerCase()} for: ${match.diagnosis.mandatorySymptoms.map(s => s.replace(/_/g, ' ')).join(", ")}.\n\n`;
                } else {
                    response += `Consider checking your ${match.originPart.toLowerCase()} for: ${match.diagnosis.mandatorySymptoms.map(s => s.replace(/_/g, ' ')).join(", ")}.\n\n`;
                }
                
                response += `---\n\n`;
            });
            
            if (localMatches.length > 0) {
                response += `**Additionally, regarding your ${selectedBodyPart} specifically:**\n\n`;
            }
        }
        
        if (localMatches.length === 1) {
            const match = localMatches[0];
            const diagnosis = match.diagnosis;
            response += `Based on what you've described (${formatSymptoms(extractedSymptoms)}), ${diagnosis.response.toLowerCase()}\n\n`;
            
            const affectedAreas = getAffectedBodyParts(diagnosis.id);
            
            if (affectedAreas.length > 0) {
                if (affectedAreas.length === 1) {
                    const area = affectedAreas[0];
                    response += `It's important to note that this condition can also affect your ${area.bodyPart.toLowerCase()}. ${area.description}\n\n`;
                } else if (affectedAreas.length === 2) {
                    response += `This condition often affects other areas of your body as well. Here's what you should know:\n\n`;
                    affectedAreas.forEach(area => {
                        response += `Regarding your ${area.bodyPart.toLowerCase()}: ${area.description}\n\n`;
                    });
                } else {
                    const bodyPartList = affectedAreas.slice(0, -1).map(a => a.bodyPart.toLowerCase()).join(", ");
                    const lastPart = affectedAreas[affectedAreas.length - 1].bodyPart.toLowerCase();
                    response += `This condition can affect multiple areas of your body, including your ${bodyPartList}, and ${lastPart}. Let me explain the connections:\n\n`;
                    affectedAreas.forEach(area => {
                        response += `${area.bodyPart}: ${area.description}\n\n`;
                    });
                }
            }
            
            if (diagnosis.urgent) {
                response += "⚠️ Please seek emergency medical care immediately. These symptoms require urgent professional evaluation.";
            } else {
                response += "I recommend monitoring your symptoms closely. If they worsen or persist for more than a day or two, it would be wise to consult with a healthcare provider.";
            }
        } else if (localMatches.length > 1) {
            if (urgentDiagnoses.length > 0) {
                response += `⚠️ URGENT: Based on your symptoms (${formatSymptoms(extractedSymptoms)}), you may be experiencing:\n\n`;
                
                urgentDiagnoses.forEach((match, i) => {
                    const diagnosis = match.diagnosis;
                    response += `${diagnosis.response}\n\n`;
                    
                    const affectedAreas = getAffectedBodyParts(diagnosis.id);
                    if (affectedAreas.length > 0) {
                        const bodyPartNames = affectedAreas.map(area => area.bodyPart.toLowerCase()).join(" and ");
                        response += `This can also impact your ${bodyPartNames}. ${affectedAreas[0].description}\n\n`;
                    }
                });
                
                response += "🚨 Please seek emergency medical care immediately. Do not wait.\n\n";
            }
            
            if (nonUrgentDiagnoses.length > 0) {
                if (urgentDiagnoses.length > 0) {
                    response += "Additionally, if this is not an emergency, other possibilities include:\n\n";
                } else {
                    if (nonUrgentDiagnoses.length === 2) {
                        response += `Based on your symptoms (${formatSymptoms(extractedSymptoms)}), I see two equally likely possibilities:\n\n`;
                    } else {
                        response += `Based on your symptoms (${formatSymptoms(extractedSymptoms)}), the most likely possibilities are:\n\n`;
                    }
                }
                
                nonUrgentDiagnoses.forEach((match, i) => {
                    const diagnosis = match.diagnosis;
                    response += `${i + 1}. ${diagnosis.name}: ${diagnosis.response}\n`;
                    
                    const affectedAreas = getAffectedBodyParts(diagnosis.id);
                    if (affectedAreas.length > 0) {
                        const bodyPartNames = affectedAreas.map(area => area.bodyPart.toLowerCase()).join(" and ");
                        response += `   This can also impact your ${bodyPartNames}.\n`;
                    }
                    response += `\n`;
                });
                
                response += "I recommend monitoring your symptoms closely. If they worsen or persist, please consult with a healthcare provider. ";
            }
        } else if (referredMatches.length > 0 && localMatches.length === 0) {
            response += `\nI didn't find a direct diagnosis for your ${selectedBodyPart.toLowerCase()} based on those symptoms alone. However, please pay close attention to the connection I mentioned above, as it may indicate a condition originating elsewhere in your body.`;
        }
        
        return response;
    }


    function askForMoreSymptoms(extractedSymptoms, bodyPart) {
        let response = "";
        
        if (extractedSymptoms.size > 0) {
            response += `I can see you're experiencing ${formatSymptoms(extractedSymptoms)}, but I need a bit more information to give you an accurate assessment. `;
        } else {
            response += "I'd like to help, but I need more specific details about what you're feeling. ";
        }
        
        const prompts = {
            Head: "Could you describe the pain more specifically? For example, is it sharp or dull? Are you noticing any changes in your vision, or feeling dizzy or nauseous?",
            Torso: "Can you tell me more about where exactly you're feeling this? Is it in your chest, abdomen, or back? Are you having any trouble breathing, or experiencing sweating or nausea?",
            LeftArm: "I'd like to know more about what you're experiencing. Is there any numbness or tingling? Do you feel weak, or is there pain shooting down your arm?",
            RightArm: "Can you describe the sensation in more detail? Are you feeling numbness, tingling, or weakness? Is the pain sharp or does it radiate from somewhere else?",
            Legs: "Tell me more about what you're noticing. Is there any swelling, discoloration, or pain when you walk? Do you have numbness or weakness?"
        };
        
        response += prompts[bodyPart] || "Can you give me more details about what you're experiencing?";
        return response;
    }

    function diagnoseChatbot(sessionId, selectedBodyPart, gender, userMessage) {
    const session = getOrCreateSession(sessionId);
    
    if (session.selectedBodyPart !== selectedBodyPart || session.gender !== gender) {
        session.selectedBodyPart = selectedBodyPart;
        session.gender = gender;
        session.accumulatedSymptoms = new Set();
        session.messageHistory = [];
    }
    
    session.messageHistory.push(userMessage);
    const normalizedSelectedPart = normalizeBodyPart(selectedBodyPart);
    
    const newLocalSymptoms = extractSymptoms(userMessage, selectedBodyPart, gender);
    newLocalSymptoms.forEach(symptom => session.accumulatedSymptoms.add(symptom));
    
    const allSymptoms = extractAllSymptoms(userMessage, gender);

    const localSymptomNames = new Set(getSymptomSet(selectedBodyPart, gender).map(s => s.name));
    const remoteSymptoms = new Set([...allSymptoms].filter(s => !localSymptomNames.has(s)));

    const referredMatches = findReferredDiagnoses(selectedBodyPart, session.accumulatedSymptoms, allSymptoms, gender);
    
    if (session.accumulatedSymptoms.size === 0 && remoteSymptoms.size > 0 && referredMatches.length === 0) {
        const remoteSympList = formatSymptoms(remoteSymptoms);
        
        const findMatchingParts = () => {
            const matches = [];
            for (const [part, data] of Object.entries(humanBody)) {
                const normalizedPart = normalizeBodyPart(part);
                if (normalizedPart === normalizedSelectedPart) continue;
                
                const partSymptoms = new Set(getSymptomSet(part, gender).map(s => s.name));
                const intersection = [...remoteSymptoms].filter(s => partSymptoms.has(s));
                
                if (intersection.length > 0) {
                    matches.push({
                        part: part,
                        matchedSymptoms: intersection,
                        matchCount: intersection.length
                    });
                }
            }
            return matches.sort((a, b) => b.matchCount - a.matchCount); 
        };

        const matchingParts = findMatchingParts();
        
        let response = `I noticed you mentioned symptoms like "${remoteSympList}", which are typically associated with other areas of the body.`;
        
        if (matchingParts.length > 0) {
            if (matchingParts.length === 1) {
                response += `\n\nYour symptoms are highly specific to the "${matchingParts[0].part}".\n\nTo give you the best advice, please reset the model and choose the highlighted part.`;
            } else {
                const topMatch = matchingParts[0];
                const otherParts = matchingParts.slice(1).map(m => m.part).join(" or ");
                response += `\n\nYour symptoms could relate to the ${topMatch.part}${matchingParts.length > 1 ? ` or ${otherParts}` : ''}.\n\nTo give you the best advice, please click on the appropriate body part to continue the diagnosis.`;
            }
        } else {
            response += `\n\nI can only diagnose symptoms related to the "${selectedBodyPart}" right now. Please describe what you are feeling in that area.`;
        }
        
        return {
            message: response,
            shouldRedirect: true,  
            suggestedParts: matchingParts.map(m => m.part)
        };
    }

    if (session.accumulatedSymptoms.size === 0 && allSymptoms.size === 0) {
        return "I couldn't identify specific symptoms from your message. Could you describe what you're feeling more specifically? For example, mention pain, discomfort, sensations, or other symptoms you're experiencing.";
    }
    
    const localMatches = findMatchingDiagnoses(selectedBodyPart, gender, session.accumulatedSymptoms);
    
    const allMatches = [...referredMatches, ...localMatches];
    
    if (allMatches.length === 0) {
        return askForMoreSymptoms(session.accumulatedSymptoms, selectedBodyPart);
    }
    
    const rankedDiagnoses = rankByMatchScore(allMatches);
    return buildResponse(rankedDiagnoses, session.accumulatedSymptoms, selectedBodyPart);
}

    app.get("/", (req, res) => {
        res.json({ status: "Server is running" });
    });

    app.post("/chat", (req, res) => {
        try {
            const { message, bodyPart, gender, sessionId } = req.body;

            if (!message || !bodyPart || !gender) {
                return res.status(400).json({ 
                    error: "Missing required fields",
                    reply: "Sorry, I need a message, body part selection, and gender."
                });
            }

            const validBodyParts = ["Head", "Torso", "LeftArm", "RightArm", "Legs"];
            if (!validBodyParts.includes(bodyPart)) {
                return res.status(400).json({
                    error: "Invalid body part",
                    reply: "Please select a valid body part."
                });
            }

            if (!["male", "female"].includes(gender)) {
                return res.status(400).json({
                    error: "Invalid gender",
                    reply: "Gender must be 'male' or 'female'."
                });
            }

            const session = sessionId || `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            console.log(`[${session}] Gender: ${gender} | Body Part: ${bodyPart} | Message: "${message}"`);

            const reply = diagnoseChatbot(session, bodyPart, gender, message);

            if (typeof reply === 'object' && reply.shouldRedirect) {
                res.json({ 
                    reply: reply.message,
                    sessionId: session,
                    shouldRedirect: true,  
                    suggestedParts: reply.suggestedParts || [],
                    accumulatedSymptoms: conversationSessions[session] 
                        ? [...conversationSessions[session].accumulatedSymptoms]
                        : []
                });
            } else {
                res.json({ 
                    reply: typeof reply === 'string' ? reply : reply.message,
                    sessionId: session,
                    shouldRedirect: false,
                    accumulatedSymptoms: conversationSessions[session] 
                        ? [...conversationSessions[session].accumulatedSymptoms]
                        : []
                });
            }

        } catch (error) {
            console.error("Error processing chat:", error);
            res.status(500).json({ 
                reply: "Sorry, something went wrong processing your request. Please try again." 
            });
        }
    });

    app.post("/reset-session", (req, res) => {
        try {
            const { sessionId } = req.body;
            
            if (sessionId && conversationSessions[sessionId]) {
                delete conversationSessions[sessionId];
                return res.json({ 
                    success: true,
                    message: "Session reset successfully"
                });
            }
            
            res.json({ 
                success: true,
                message: "No active session to reset"
            });
            
        } catch (error) {
            console.error("Error resetting session:", error);
            res.status(500).json({ 
                success: false,
                message: "Error resetting session"
            });
        }
    });

    app.use((req, res) => {
        res.status(404).json({ error: "Endpoint not found" });
    });

    app.listen(PORT, () => {
        console.log(`Server running on http://localhost:${PORT}`);
    });