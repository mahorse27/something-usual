var acConfig = null;
var acActive = true;
var acAppendComma = false;

// Style for new elements. Gets appended to the Gradio root.
let autocompleteCSS_dark = `
    .autocompleteResults {
        position: absolute;
        z-index: 999;
        margin: 5px 0 0 0;
        background-color: #0b0f19 !important;
        border: 1px solid #4b5563 !important;
        border-radius: 12px !important;
        overflow-y: auto;
    }
    .autocompleteResultsList > li:nth-child(odd) {
        background-color: #111827;
    }
    .autocompleteResultsList > li {
        list-style-type: none;
        padding: 10px;
        cursor: pointer;
    }
    .autocompleteResultsList > li:hover {
        background-color: #1f2937;
    }
    .autocompleteResultsList > li.selected {
        background-color: #374151;
    }
`;
let autocompleteCSS_light = `
    .autocompleteResults {
        position: absolute;
        z-index: 999;
        margin: 5px 0 0 0;
        background-color: #ffffff !important;
        border: 1.5px solid #e5e7eb !important;
        border-radius: 12px !important;
        overflow-y: auto;
    }
    .autocompleteResultsList > li:nth-child(odd) {
        background-color: #f9fafb;
    }
    .autocompleteResultsList > li {
        list-style-type: none;
        padding: 10px;
        cursor: pointer;
    }
    .autocompleteResultsList > li:hover {
        background-color: #f5f6f8;
    }
    .autocompleteResultsList > li.selected {
        background-color: #e5e7eb;
    }
`;

// Parse the CSV file into a 2D array. Doesn't use regex, so it is very lightweight.
function parseCSV(str) {
    var arr = [];
    var quote = false;  // 'true' means we're inside a quoted field

    // Iterate over each character, keep track of current row and column (of the returned array)
    for (var row = 0, col = 0, c = 0; c < str.length; c++) {
        var cc = str[c], nc = str[c + 1];        // Current character, next character
        arr[row] = arr[row] || [];             // Create a new row if necessary
        arr[row][col] = arr[row][col] || '';   // Create a new column (start with empty string) if necessary

        // If the current character is a quotation mark, and we're inside a
        // quoted field, and the next character is also a quotation mark,
        // add a quotation mark to the current column and skip the next character
        if (cc == '"' && quote && nc == '"') { arr[row][col] += cc; ++c; continue; }

        // If it's just one quotation mark, begin/end quoted field
        if (cc == '"') { quote = !quote; continue; }

        // If it's a comma and we're not in a quoted field, move on to the next column
        if (cc == ',' && !quote) { ++col; continue; }

        // If it's a newline (CRLF) and we're not in a quoted field, skip the next character
        // and move on to the next row and move to column 0 of that new row
        if (cc == '\r' && nc == '\n' && !quote) { ++row; col = 0; ++c; continue; }

        // If it's a newline (LF or CR) and we're not in a quoted field,
        // move on to the next row and move to column 0 of that new row
        if (cc == '\n' && !quote) { ++row; col = 0; continue; }
        if (cc == '\r' && !quote) { ++row; col = 0; continue; }

        // Otherwise, append the current character to the current column
        arr[row][col] += cc;
    }
    return arr;
}

// Load file
function readFile(filePath) {
    return new Promise(function (resolve, reject) {
        let request = new XMLHttpRequest();
        request.open("GET", filePath, true);
        request.onload = function () {
            var status = request.status;
            if (status == 200) {
                resolve(request.responseText);
            } else {
                reject(status);
            }
        };
        request.send(null);
    });
}

// Load CSV
async function loadCSV(path) {
    let text = await readFile(path);
    return parseCSV(text);
}

// Debounce function to prevent spamming the autocomplete function
var dbTimeOut;
const debounce = (func, wait = 300) => {
    return function (...args) {
        if (dbTimeOut) {
            clearTimeout(dbTimeOut);
        }

        dbTimeOut = setTimeout(() => {
            func.apply(this, args);
        }, wait);
    }
}

// Difference function to fix duplicates not being seen as changes in normal filter
function difference(a, b) {
    if (a.length == 0) {
        return b;
    }
    if (b.length == 0) {
        return a;
    }

    return [...b.reduce((acc, v) => acc.set(v, (acc.get(v) || 0) - 1),
        a.reduce((acc, v) => acc.set(v, (acc.get(v) || 0) + 1), new Map())
    )].reduce((acc, [v, count]) => acc.concat(Array(Math.abs(count)).fill(v)), []);
}

// Get the identifier for the text area to differentiate between positive and negative
function getTextAreaIdentifier(textArea) {
    let txt2img_p = gradioApp().querySelector('#txt2img_prompt > label > textarea');
    let txt2img_n = gradioApp().querySelector('#txt2img_neg_prompt > label > textarea');
    let img2img_p = gradioApp().querySelector('#img2img_prompt > label > textarea');
    let img2img_n = gradioApp().querySelector('#img2img_neg_prompt > label > textarea');

    let modifier = "";
    switch (textArea) {
        case txt2img_p:
            modifier = ".txt2img.p";
            break;
        case txt2img_n:
            modifier = ".txt2img.n";
            break;
        case img2img_p:
            modifier = ".img2img.p";
            break;
        case img2img_n:
            modifier = ".img2img.n";
            break;
        default:
            break;
    }
    return modifier;
}

// Create the result list div and necessary styling
function createResultsDiv(textArea) {
    let resultsDiv = document.createElement("div");
    let resultsList = document.createElement('ul');

    let textAreaId = getTextAreaIdentifier(textArea);
    let typeClass = textAreaId.replaceAll(".", " ");

    resultsDiv.style.setProperty("max-height", acConfig.maxResults * 50 + "px");
    resultsDiv.setAttribute('class', `autocompleteResults ${typeClass}`);
    resultsList.setAttribute('class', 'autocompleteResultsList');
    resultsDiv.appendChild(resultsList);

    return resultsDiv;
}

// Create the checkbox to enable/disable autocomplete
function createCheckbox(text) {
    let label = document.createElement("label");
    let input = document.createElement("input");
    let span = document.createElement("span");

    label.setAttribute('id', 'acActiveCheckbox');
    label.setAttribute('class', '"flex items-center text-gray-700 text-sm rounded-lg cursor-pointer dark:bg-transparent');
    input.setAttribute('type', 'checkbox');
    input.setAttribute('class', 'gr-check-radio gr-checkbox')
    span.setAttribute('class', 'ml-2');

    span.textContent = text;

    label.appendChild(input);
    label.appendChild(span);
    return label;
}

// The selected tag index. Needs to be up here so hide can access it.
var selectedTag = null;
var previousTags = [];

// Show or hide the results div
function isVisible(textArea) {
    let textAreaId = getTextAreaIdentifier(textArea);
    let resultsDiv = gradioApp().querySelector('.autocompleteResults' + textAreaId);
    return resultsDiv.style.display === "block";
}
function showResults(textArea) {
    let textAreaId = getTextAreaIdentifier(textArea);
    let resultsDiv = gradioApp().querySelector('.autocompleteResults' + textAreaId);
    resultsDiv.style.display = "block";
}
function hideResults(textArea) {
    let textAreaId = getTextAreaIdentifier(textArea);
    let resultsDiv = gradioApp().querySelector('.autocompleteResults' + textAreaId);
    resultsDiv.style.display = "none";
    selectedTag = null;
}

function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
}

const WEIGHT_REGEX = /[([]([^,()[\]:| ]+)(?::(?:\d+(?:\.\d+)?|\.\d+))?[)\]]/g;
const TAG_REGEX = /([^\s,|]+)/g
let hideBlocked = false;

// On click, insert the tag into the prompt textbox with respect to the cursor position
function insertTextAtCursor(textArea, result, tagword) {
    let text = result[0];
    let tagType = result[1];

    let cursorPos = textArea.selectionStart;
    var sanitizedText = text

    // Replace differently depending on if it's a tag or wildcard
    if (tagType === "wildcardFile") {
        sanitizedText = "__" + text.replace("Wildcards: ", "") + "__";
    } else if (tagType === "wildcardTag") {
        sanitizedText = text.replace(/^.*?: /g, "");
    } else if (tagType === "embedding") {
        sanitizedText = `<${text.replace(/^.*?: /g, "")}>`;
    } else {
        sanitizedText = acConfig.replaceUnderscores ? text.replaceAll("_", " ") : text;
    }

    if (acConfig.escapeParentheses) {
        sanitizedText = sanitizedText
            .replaceAll("(", "\\(")
            .replaceAll(")", "\\)")
            .replaceAll("[", "\\[")
            .replaceAll("]", "\\]");
    }

    var prompt = textArea.value;

    // Edit prompt text
    let editStart = Math.max(cursorPos - tagword.length, 0);
    let editEnd = Math.min(cursorPos + tagword.length, prompt.length);
    let surrounding = prompt.substring(editStart, editEnd);
    let match = surrounding.match(new RegExp(escapeRegExp(`${tagword}`), "i"));
    let afterInsertCursorPos = editStart + match.index + sanitizedText.length;

    var optionalComma = "";
    if (acAppendComma && tagType !== "wildcardFile") {
        optionalComma = surrounding.match(new RegExp(`${escapeRegExp(tagword)}[,:]`, "i")) !== null ? "" : ", ";
    }

    // Replace partial tag word with new text, add comma if needed
    let insert = surrounding.replace(match, sanitizedText + optionalComma);

    // Add back start
    var newPrompt = prompt.substring(0, editStart) + insert + prompt.substring(editEnd);
    textArea.value = newPrompt;
    textArea.selectionStart = afterInsertCursorPos + optionalComma.length;
    textArea.selectionEnd = textArea.selectionStart

    // Since we've modified a Gradio Textbox component manually, we need to simulate an `input` DOM event to ensure its
    // internal Svelte data binding remains in sync.
    textArea.dispatchEvent(new Event("input", { bubbles: true }));

    // Update previous tags with the edited prompt to prevent re-searching the same term
    let weightedTags = [...newPrompt.matchAll(WEIGHT_REGEX)]
            .map(match => match[1]);
    let tags = newPrompt.match(TAG_REGEX)
    if (weightedTags !== null) {
        tags = tags.filter(tag => !weightedTags.some(weighted => tag.includes(weighted)))
            .concat(weightedTags);
    }
    previousTags = tags;

    // Hide results after inserting
    if (tagType === "wildcardFile") {
        // If it's a wildcard, we want to keep the results open so the user can select another wildcard
        hideBlocked = true;
        autocomplete(textArea, prompt, sanitizedText);
        setTimeout(() => { hideBlocked = false; }, 100);
    } else {
        hideResults(textArea);
    }
}

function addResultsToList(textArea, results, tagword, resetList) {
    let textAreaId = getTextAreaIdentifier(textArea);
    let resultDiv = gradioApp().querySelector('.autocompleteResults' + textAreaId);
    let resultsList = resultDiv.querySelector('ul');

    // Reset list, selection and scrollTop since the list changed
    if (resetList) {
        resultsList.innerHTML = "";
        selectedTag = null;
        resultDiv.scrollTop = 0;
        resultCount = 0;
    }

    // Find right colors from config
    let tagFileName = acConfig.tagFile.split(".")[0];
    let tagColors = acConfig.colors;
    let mode = gradioApp().querySelector('.dark') ? 0 : 1;
    let nextLength = Math.min(results.length, resultCount + acConfig.resultStepLength);

    for (let i = resultCount; i < nextLength; i++) {
        let result = results[i];
        let li = document.createElement("li");

        //suppost only show the translation to result
        if (result[2]) {
            li.textContent = result[2];
            if (!acConfig.translation.onlyShowTranslation) {
                li.textContent += " >> " + result[0];
            }
        } else {
            li.textContent = result[0];
        }

        // Wildcards & Embeds have no tag type
        if (!result[1].startsWith("wildcard") && result[1] !== "embedding") {
            // Set the color of the tag
            let tagType = result[1];
            let colorGroup = tagColors[tagFileName];
            // Default to danbooru scheme if no matching one is found
            if (colorGroup === undefined) colorGroup = tagColors["danbooru"];

            li.style = `color: ${colorGroup[tagType][mode]};`;
        }

        // Add listener
        li.addEventListener("click", function () { insertTextAtCursor(textArea, result, tagword); });
        // Add element to list
        resultsList.appendChild(li);
    }
    resultCount = nextLength;
}

function updateSelectionStyle(textArea, newIndex, oldIndex) {
    let textAreaId = getTextAreaIdentifier(textArea);
    let resultDiv = gradioApp().querySelector('.autocompleteResults' + textAreaId);
    let resultsList = resultDiv.querySelector('ul');
    let items = resultsList.getElementsByTagName('li');

    if (oldIndex != null) {
        items[oldIndex].classList.remove('selected');
    }

    // make it safer
    if (newIndex !== null) {
        items[newIndex].classList.add('selected');
    }

    // Set scrolltop to selected item if we are showing more than max results
    if (items.length > acConfig.maxResults) {
        let selected = items[newIndex];
        resultDiv.scrollTop = selected.offsetTop - resultDiv.offsetTop;
    }
}

var wildcardFiles = [];
var wildcardExtFiles = [];
var embeddings = [];
var allTags = [];
var results = [];
var tagword = "";
var resultCount = 0;
async function autocomplete(textArea, prompt, fixedTag = null) {
    // Return if the function is deactivated in the UI
    if (!acActive) return;

    // Guard for empty prompt
    if (prompt.length === 0) {
        hideResults(textArea);
        return;
    }

    if (fixedTag === null) {
        // Match tags with RegEx to get the last edited one
        // We also match for the weighting format (e.g. "tag:1.0") here, and combine the two to get the full tag word set
        let weightedTags = [...prompt.matchAll(WEIGHT_REGEX)]
            .map(match => match[1]);
        let tags = prompt.match(TAG_REGEX)
        if (weightedTags !== null) {
            tags = tags.filter(tag => !weightedTags.some(weighted => tag.includes(weighted)))
                .concat(weightedTags);
        }

        let tagCountChange = tags.length - previousTags.length;
        let diff = difference(tags, previousTags);
        previousTags = tags;

        // Guard for no difference / only whitespace remaining / last edited tag was fully removed
        if (diff === null || diff.length === 0 || (diff.length === 1 && tagCountChange < 0)) {
            if (!hideBlocked) hideResults(textArea);
            return;
        }

        tagword = diff[0]

        // Guard for empty tagword
        if (tagword === null || tagword.length === 0) {
            hideResults(textArea);
            return;
        }
    } else {
        tagword = fixedTag;
    }

    tagword = tagword.toLowerCase().replace(/[\n\r]/g, "");

    if (acConfig.useWildcards && [...tagword.matchAll(/\b__([^, ]+)__([^, ]*)\b/g)].length > 0) {
        // Show wildcards from a file with that name
        wcMatch = [...tagword.matchAll(/\b__([^, ]+)__([^, ]*)\b/g)]
        let wcFile = wcMatch[0][1];
        let wcWord = wcMatch[0][2];

        var wcPair;

        // Look in normal wildcard files
        if (wcFound = wildcardFiles.find(x => x[1].toLowerCase() === wcFile))
            wcPair = wcFound;
        else // Look in extensions wildcard files
            wcPair = wildcardExtFiles.find(x => x[1].toLowerCase() === wcFile);

        let wildcards = (await readFile(`file/${wcPair[0]}/${wcPair[1]}.txt?${new Date().getTime()}`)).split("\n")
            .filter(x => x.trim().length > 0 && !x.startsWith('#'));  // Remove empty lines and comments

        results = wildcards.filter(x => (wcWord !== null && wcWord.length > 0) ? x.toLowerCase().includes(wcWord) : x) // Filter by tagword
            .map(x => [wcFile + ": " + x.trim(), "wildcardTag"]); // Mark as wildcard
    } else if (acConfig.useWildcards && (tagword.startsWith("__") && !tagword.endsWith("__") || tagword === "__")) {
        // Show available wildcard files
        let tempResults = [];
        if (tagword !== "__") {
            let lmb = (x) => x[1].toLowerCase().includes(tagword.replace("__", ""))
            tempResults = wildcardFiles.filter(lmb).concat(wildcardExtFiles.filter(lmb)) // Filter by tagword
        } else {
            tempResults = wildcardFiles.concat(wildcardExtFiles);
        }
        results = tempResults.map(x => ["Wildcards: " + x[1].trim(), "wildcardFile"]); // Mark as wildcard
    } else if (acConfig.useEmbeddings && tagword.match(/<[^,> ]*>?/g)) {
        // Show embeddings
        let tempResults = [];
        if (tagword !== "<") {
            tempResults = embeddings.filter(x => x.toLowerCase().includes(tagword.replace("<", ""))) // Filter by tagword
        } else {
            tempResults = embeddings;
        }
        // Since some tags are kaomoji, we have to still get the normal results first.
        genericResults = allTags.filter(x => x[0].toLowerCase().includes(tagword)).slice(0, acConfig.maxResults);
        results = genericResults.concat(tempResults.map(x => ["Embeddings: " + x.trim(), "embedding"])); // Mark as embedding
    } else {
        if (acConfig.translation.searchByTranslation) {
            results = allTags.filter(x => x[2] && x[2].toLowerCase().includes(tagword)); // check have translation
            // if search by [a~z],first list the translations, and then search English if it is not enough
            // if only show translation,it is unnecessary to list English results
            if (!acConfig.translation.onlyShowTranslation) {
                results = results.concat(allTags.filter(x => x[0].toLowerCase().includes(tagword) && !results.includes(x)));
            }
        } else {
            results = allTags.filter(x => x[0].toLowerCase().includes(tagword));
        }
        // it's good to show all results
        if (!acConfig.showAllResults) {
            results = results.slice(0, acConfig.maxResults);
        }
    }

    // Guard for empty results
    if (!results.length) {
        hideResults(textArea);
        return;
    }

    showResults(textArea);
    addResultsToList(textArea, results, tagword, true);
}

var oldSelectedTag = null;
function navigateInList(textArea, event) {
    // Return if the function is deactivated in the UI
    if (!acActive) return;

    validKeys = ["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", "Enter", "Tab", "Escape"];
    if (acConfig.useLeftRightArrowKeys)
        validKeys.push("ArrowLeft", "ArrowRight");

    if (!validKeys.includes(event.key)) return;
    if (!isVisible(textArea)) return
    // Return if ctrl key is pressed to not interfere with weight editing shortcut
    if (event.ctrlKey || event.altKey) return;

    oldSelectedTag = selectedTag;

    switch (event.key) {
        case "ArrowUp":
            if (selectedTag === null) {
                selectedTag = resultCount - 1;
            } else {
                selectedTag = (selectedTag - 1 + resultCount) % resultCount;
            }
            break;
        case "ArrowDown":
            if (selectedTag === null) {
                selectedTag = 0;
            } else {
                selectedTag = (selectedTag + 1) % resultCount;
            }
            break;
        case "PageUp":
            if (selectedTag === null || selectedTag === 0) {
                selectedTag = resultCount - 1;
            } else {
                selectedTag = (Math.max(selectedTag - 5, 0) + resultCount) % resultCount;
            }
            break;
        case "PageDown":
            if (selectedTag === null || selectedTag === resultCount - 1) {
                selectedTag = 0;
            } else {
                selectedTag = Math.min(selectedTag + 5, resultCount - 1) % resultCount;
            }
            break;
        case "Home":
            selectedTag = 0;
            break;
        case "End":
            selectedTag = resultCount - 1;
            break;
        case "ArrowLeft":
            selectedTag = 0;
            break;
        case "ArrowRight":
            selectedTag = resultCount - 1;
            break;
        case "Enter":
            if (selectedTag !== null) {
                insertTextAtCursor(textArea, results[selectedTag], tagword);
            }
            break;
        case "Tab":
            if (selectedTag === null) {
                selectedTag = 0;
            }
            insertTextAtCursor(textArea, results[selectedTag], tagword);
            break;
        case "Escape":
            hideResults(textArea);
            break;
    }
    if (selectedTag === resultCount - 1
        && (event.key === "ArrowUp" || event.key === "ArrowDown" || event.key === "ArrowLeft" || event.key === "ArrowRight")) {
        addResultsToList(textArea, results, tagword, false);
    }
    // Update highlighting
    if (selectedTag !== null)
        updateSelectionStyle(textArea, selectedTag, oldSelectedTag);

    // Prevent default behavior
    event.preventDefault();
    event.stopPropagation();
}

// One-time setup
document.addEventListener("DOMContentLoaded", async () => {
    // Get our tag base path from the temp file
    let tagBasePath = await readFile(`file/tmp/tagAutocompletePath.txt?${new Date().getTime()}`);

    // Load config
    if (acConfig === null) {
        try {
            acConfig = JSON.parse(await readFile(`file/${tagBasePath}/config.json?${new Date().getTime()}`));
            if (acConfig.translation.onlyShowTranslation) {
                acConfig.translation.searchByTranslation = true; // if only show translation, enable search by translation is necessary
            }
        } catch (e) {
            console.error("Error loading config.json: " + e);
            return;
        }
    }
    // Load main tags and translations
    if (allTags.length === 0) {
        try {
            allTags = await loadCSV(`file/${tagBasePath}/${acConfig.tagFile}?${new Date().getTime()}`);
        } catch (e) {
            console.error("Error loading tags file: " + e);
            return;
        }
        if (acConfig.extra.extraFile) {
            try {
                extras = await loadCSV(`file/${tagBasePath}/${acConfig.extra.extraFile}`);
                if (acConfig.extra.onlyTranslationExtraFile) {
                    // This works purely on index, so it's not very robust. But a lot faster.
                    for (let i = 0, n = extras.length; i < n; i++) {
                        if (extras[i][0]) {
                            allTags[i][2] = extras[i][0];
                        }
                    }
                } else {
                    extras.forEach(e => {
                        // Check if a tag in allTags has the same name as the extra tag
                        if (tag = allTags.find(t => t[0] === e[0] && t[1] == e[1])) {
                            if (e[2]) // If the extra tag has a translation, add it to the tag
                                tag[2] = e[2];
                        } else {
                            // If the tag doesn't exist, add it to allTags
                            allTags.push(e);
                        }
                    });
                }
            } catch (e) {
                console.error("Error loading extra translation file: " + e);
                return;
            }
        }
    }
    // Load wildcards
    if (acConfig.useWildcards && wildcardFiles.length === 0) {
        try {
            let wcFileArr = (await readFile(`file/${tagBasePath}/temp/wc.txt?${new Date().getTime()}`)).split("\n");
            let wcBasePath = wcFileArr[0].trim(); // First line should be the base path
            wildcardFiles = wcFileArr.slice(1)
                .filter(x => x.trim().length > 0) // Remove empty lines
                .map(x => [wcBasePath, x.trim().replace(".txt", "")]); // Remove file extension & newlines

            // To support multiple sources, we need to separate them using the provided "-----" strings
            let wcExtFileArr = (await readFile(`file/${tagBasePath}/temp/wce.txt?${new Date().getTime()}`)).split("\n");
            let splitIndices = [];
            for (let index = 0; index < wcExtFileArr.length; index++) {
                if (wcExtFileArr[index].trim() === "-----") {
                    splitIndices.push(index);
                }
            }
            // For each group, add them to the wildcardFiles array with the base path as the first element
            for (let i = 0; i < splitIndices.length; i++) {
                let start = splitIndices[i - 1] || 0;
                if (i > 0) start++; // Skip the "-----" line
                let end = splitIndices[i];

                let wcExtFile = wcExtFileArr.slice(start, end);
                let base = wcExtFile[0].trim() + "/";
                wcExtFile = wcExtFile.slice(1)
                    .filter(x => x.trim().length > 0) // Remove empty lines
                    .map(x => x.trim().replace(base, "").replace(".txt", "")); // Remove file extension & newlines;

                wcExtFile = wcExtFile.map(x => [base, x]);
                wildcardExtFiles.push(...wcExtFile);
            }
        } catch (e) {
            console.error("Error loading wildcards: " + e);
        }
    }
    // Load embeddings
    if (acConfig.useEmbeddings && embeddings.length === 0) {
        try {
            embeddings = (await readFile(`file/${tagBasePath}/temp/emb.txt?${new Date().getTime()}`)).split("\n")
                .filter(x => x.trim().length > 0) // Remove empty lines
                .map(x => x.replace(".bin", "").replace(".pt", "").replace(".png", "")); // Remove file extensions
        } catch (e) {
            console.error("Error loading embeddings.txt: " + e);
        }
    }

    // Find all textareas
    let txt2imgTextArea = gradioApp().querySelector('#txt2img_prompt > label > textarea');
    let img2imgTextArea = gradioApp().querySelector('#img2img_prompt > label > textarea');
    let txt2imgTextArea_n = gradioApp().querySelector('#txt2img_neg_prompt > label > textarea');
    let img2imgTextArea_n = gradioApp().querySelector('#img2img_neg_prompt > label > textarea');
    let textAreas = [txt2imgTextArea, img2imgTextArea, txt2imgTextArea_n, img2imgTextArea_n];

    let quicksettings = gradioApp().querySelector('#quicksettings');

    // Not found, we're on a page without prompt textareas
    if (textAreas.every(v => v === null || v === undefined)) return;
    // Already added or unnecessary to add
    if (gradioApp().querySelector('.autocompleteResults.p')) {
        if (gradioApp().querySelector('.autocompleteResults.n') || !acConfig.activeIn.negativePrompts) {
            return;
        }
    } else if (!acConfig.activeIn.txt2img && !acConfig.activeIn.img2img) {
        return;
    }

    textAreas.forEach(area => {
        // Return if autocomplete is disabled for the current area type in config
        let textAreaId = getTextAreaIdentifier(area);
        if ((!acConfig.activeIn.img2img && textAreaId.includes("img2img"))
            || (!acConfig.activeIn.txt2img && textAreaId.includes("txt2img"))
            || (!acConfig.activeIn.negativePrompts && textAreaId.includes("n"))) {
            return;
        }

        // Only add listeners once
        if (!area.classList.contains('autocomplete')) {
            // Add our new element
            var resultsDiv = createResultsDiv(area);
            area.parentNode.insertBefore(resultsDiv, area.nextSibling);
            // Hide by default so it doesn't show up on page load
            hideResults(area);

            // Add autocomplete event listener
            area.addEventListener('input', debounce(() => autocomplete(area, area.value), acConfig.delayTime));
            // Add focusout event listener
            area.addEventListener('focusout', debounce(() => hideResults(area), 400));
            // Add up and down arrow event listener
            area.addEventListener('keydown', (e) => navigateInList(area, e));

            // Add class so we know we've already added the listeners
            area.classList.add('autocomplete');
        }
    });

    acAppendComma = acConfig.appendComma;
    // Add our custom options elements
    if (!acConfig.hideUIOptions && gradioApp().querySelector("#tagAutocompleteOptions") === null) {
        let optionsDiv = document.createElement("div");
        optionsDiv.id = "tagAutocompleteOptions";
        optionsDiv.classList.add("flex", "flex-col", "p-1", "px-1", "relative",  "text-sm");

        let optionsInner = document.createElement("div");
        optionsInner.classList.add("flex", "flex-row", "p-1", "gap-4", "text-gray-700");

        // Add label
        let title = document.createElement("p");
        title.textContent = "Autocomplete options";
        optionsDiv.appendChild(title);

        // Add toggle switch
        let cbActive = createCheckbox("Enable Autocomplete");
        cbActive.querySelector("input").checked = acActive;
        cbActive.querySelector("input").addEventListener("change", (e) => {
            acActive = e.target.checked;
        });
        // Add comma switch
        let cbComma = createCheckbox("Append commas");
        cbComma.querySelector("input").checked = acAppendComma;
        cbComma.querySelector("input").addEventListener("change", (e) => {
            acAppendComma = e.target.checked;
        });

        // Add options to optionsDiv
        optionsInner.appendChild(cbActive);
        optionsInner.appendChild(cbComma);
        optionsDiv.appendChild(optionsInner);

        // Add options div to DOM
        quicksettings.parentNode.insertBefore(optionsDiv, quicksettings.nextSibling);
    }

    // Add style to dom
    let acStyle = document.createElement('style');
    let css = gradioApp().querySelector('.dark') ? autocompleteCSS_dark : autocompleteCSS_light;
    if (acStyle.styleSheet) {
        acStyle.styleSheet.cssText = css;
    } else {
        acStyle.appendChild(document.createTextNode(css));
    }
    gradioApp().appendChild(acStyle);
    styleAdded = true;
});
