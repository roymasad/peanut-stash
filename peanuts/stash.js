import {  
    ref, 
    push, 
    get, 
    child,
    serverTimestamp,
    remove,
    getDatabase, 
    query,
    set,
    update,
    onValue,
    startAt,
    endAt,
    limitToLast,
    startAfter,
    orderByChild,
    limitToFirst,

 } from 'firebase/database';

import color from 'picocolors';
import * as prompts from '@clack/prompts'
import clipboard from 'clipboardy';
import { execSync } from 'child_process';
import {read} from 'read';
import open from 'open';
import fs from 'fs';
import path from 'path';
import os from 'os';

import {
    MAX_ITEMS_PER_PAGE, 
    MAX_PEANUT_TEXT_LENGTH, 
    MAX_PEANUT_NOTE_LENGTH} from './consts.js';

import {  encryptStringWithPublicKey, 
    decryptStringWithPrivateKey, 
    generateGeminiAnswers,
    getTerminalSize,
    exportPasteBin,
    fetchJsonAPI } from './utilities.js';

// Save user's data text 'peanut' to his list/stash of peanuts
// exitBehavior: "quit" or "return". depending if function is used independently or within a menu
// quit will exit the app, return will return to the main menu
export async function stashPeanut (user, db, exitBehavior="quit") {

    // variables and constants for the loop
    const uid = user.uid;
    const userEmail = user.email;
    const firebase_email = userEmail.replace(/\./g, '_');

    do {
        // load categories we can use to stash under
        const categoryRef = ref(db, `users/${firebase_email}/private/categories`);
        
        let categoriesList = []; // for display initially
        let categories = []; // to save extra data such as db ref to be able to delete
        let selectedCategory = "default";

        const snapshot = await get(categoryRef);

        try { 
            if (snapshot.exists()) {
                let index = 0;
                snapshot.forEach(element => {
                    categories.push({
                        name: element.val().name,
                        databaseRef: element.ref
                    });
                    categoriesList.push({label: element.val().name, value: `DAT:${index}:` + element.val().name});
                    index++;
                });

            } else 
            categoriesList = []; 
        } catch(error) {
            console.log(`${color.red('Error Loading Categories:')} ${error}`);
            process.exit(1);
        }
        categoriesList.reverse(); // latest first

        // add default category with suffix
        categoriesList.unshift({label: color.yellow("default"), value: "DAT:-1:default"}); //top
        categoriesList.push({label: color.cyan("Add"), value: "ADD:add"}); //bottom

        try {
            // text to stash
            var data = await read({prompt: `${color.cyan('\nType or Paste your terminal text to stash, CTRL+C to exit loop:\n')} `});
            if (data.length == 0)
                {
                    console.log(`${color.yellow("Error: Empty text")}`);
                    continue;
                }
        } catch(error) {
            if (error == "Error: canceled")
                console.log(`${color.yellow("Cancelled")}`);
            else console.log(`${color.yellow(error)}`);
            if (exitBehavior == "quit") process.exit(0);
            else return;
        }

        // Metadata to add to text are timestamp and user id/email
        // get the firebase server timestamp no the local one
        let timestamp = serverTimestamp();
    
        // Clack JS prompt, show a list of all peanuts to select from, sorted by latest
        let answer_category = await prompts.select({
            message: 'Select a category label',
            options: categoriesList
        });

        if (prompts.isCancel(answer_category)) {
            console.log(color.yellow("Cancelled"));
            if (exitBehavior == "quit") process.exit(0);
            else return;
        }
    
        // Check if we directly got an answer or are going to manage categories
        if (answer_category == "ADD:add") {

            try {
                var answer = await read({ prompt: `${color.cyan('\Add a new category label:\n')} `});
                if (answer.length == 0)
                {
                    console.log(`${color.yellow("Error: Empty text")}`);
                    if (exitBehavior == "quit") process.exit(0);
                    else return;
                }
            } catch(error) {
                if (error == "Error: canceled")
                    console.log(`${color.yellow("Cancelled")}`);
                else console.log(`${color.yellow(error)}`);
                if (exitBehavior == "quit") process.exit(0);
                else return;
            }

            // select it
            selectedCategory = answer;
            // save it to database
            await push(categoryRef,{ name : answer });
            
        } else {
            // select and remove prefix
            selectedCategory = answer_category.slice(4);
            // remove index, disgard :
            let [index, category] = selectedCategory.split(':');
            category = selectedCategory.substring(selectedCategory.indexOf(':') + 1);
            selectedCategory = category;
        }
        
        // We could impelement text sanitization here, but i don't envision a security scenario where it is needed
        // In our use case, text is saved to firebase db, there is no sql queries to protect
        // and text is displayed on terminal so there is no web browser ecosystem risks
        // Users are supposed to copy paste these text commands and use them on their terminals
        // So it is supposed to be executed manually/automatically by them
        // The only think i can think of could be the text size/length, but if we put a limitation here
        // What is the logic to define the limit? 
        // 4096 is the linux terminal limit we can use that for now, but it is unlikely to be user
        // to optimize/secure database storay space, setting it to 1024 here and in the security rules 
    
        // check that data is not bigger than max const bytes
        if (data.length > MAX_PEANUT_TEXT_LENGTH) {
            console.log(`${color.red('Error:')} Peanut text is too long`);
            if (exitBehavior == "quit") process.exit(0);
            else return;
        }
    
        let peanutData = {
            // Encrypt data with user public key and add meta data
            data: encryptStringWithPublicKey(user.publicKey, data),
            timestamp: timestamp,
            userEmail: userEmail,
            userId: uid,
            category: selectedCategory
        };
    
        try{
            await push(ref(db, `users/${firebase_email}/private/peanut-stash`), peanutData);
            console.log(color.green("Peanut Stashed. Add another or CTRL+C to exit"));

        }
        catch (error) {
            console.error(`${color.red('Error saving peanut :')} ${error}`);
            process.exit(1);
        }
        
        
    } while (true)
    
}

// List available peanuts for this user
// PS peanuts texts shared form other users will have to be copied here to be used and encrypted
export async function listPeanuts(user, db) {

    const userEmail = user.email;
    const firebase_email = userEmail.replace(/\./g, '_');

    const { console_columns, console_rows } = getTerminalSize();

    // before loading stashed peanuts
    // check if there are any pending shared peanut texts from other (approved) users
    // and make a copy of them in the stash with the category of "imported"
    // and remove them from pending when done
    let pending_ref = ref(db, `users/${firebase_email}/public/pending-text/`);
    let pending_peanuts_snapshot = await get(pending_ref);

    try {
        if (pending_peanuts_snapshot.exists()) {

            pending_peanuts_snapshot.forEach(async (peanut) => {
                let new_peanut = {
                    data: peanut.val().data,
                    timestamp: serverTimestamp(), // should we keep or replace the original timestamp?
                    userEmail: peanut.val().email,
                    userId: peanut.val().userId,
                    note : decryptStringWithPrivateKey(user.privateKey, peanut.val().note),
                    category: "imported"        // flag them as imported
                };
    
                // add to user's stash and remove from pending
                await push(ref(db, `users/${firebase_email}/private/peanut-stash`), new_peanut);
                await remove(child(pending_ref, peanut.key));

                console.log(`${color.green('A peanut was received from ')} ${peanut.val().email}`);
    
            });
        }

    } catch (error) {
        console.log(`${color.red('Error:')} ${error}`);
        process.exit(1);
    }

    // proceed as normal after loading importing any new pending text peanuts

    const peanutRef = ref(db, `users/${firebase_email}/private/peanut-stash`);
      
    // Realtime DB doesnt have a reverse sort
    // so index in the rules timestamp, load it, and reverse the loaded list

    var filterCategory = "all:all";

    var currentPage = 0;

    // Read data from the database
    while(true) {
        
        let snapshot = await get(peanutRef);
        
        if (snapshot.exists()) {
            
            // Convert snapshot to an array of values
            let peanutList = [];

            snapshot.forEach((peanut) => {
                
                // Decrypt data with user private key
                let decryptedPeanut = decryptStringWithPrivateKey(user.privateKey, peanut.val().data);
                
                if (peanut.val().category == filterCategory || filterCategory == "all:all")
                {
                    peanutList.push({
                        data:  decryptedPeanut,
                        timestamp: peanut.val().timestamp,
                        email: peanut.val().userEmail,
                        userId: peanut.val().uid,
                        category: peanut.val().category,
                        note: peanut.val().note,
                        databaseRef: peanut.ref
                        });
                }

            });

            // Reverse the loaded array to have the latest items first
            peanutList.reverse();

            // Enable pagination of the loaded list
            let listLength = peanutList.length;

            // Clack JS compatible prompt list
            let promptList;
            let answer_action;
                
            promptList = [];
            answer_action = null;

            // show current page items, pagination system

            // while not on the last page, the item_length is maxItemsPerPage - 1
            // else the items_length is the rest of the list
            let items_length = (currentPage < Math.floor(listLength / MAX_ITEMS_PER_PAGE)) ? 
                        MAX_ITEMS_PER_PAGE : listLength - (currentPage * MAX_ITEMS_PER_PAGE);

            
            // loop and fill the page items from the loaded list
            for (let    i = 0 + (currentPage * MAX_ITEMS_PER_PAGE); 
                        i < items_length+ (currentPage * MAX_ITEMS_PER_PAGE); i++) {

                let peanut = peanutList[i];

                // Show user email if the peanut is shared by another user
                // Don't show the email if it is the user's peanut

                // add \t for padding
                let email_label = "\t" +( (peanut.email != user.email) ? ` (${peanut.email})` : '');
                let category_label = "\t" + ((peanut.category != 'default') ? ` #${peanut.category}` : '');
                // technically category is capped at 32 in the database, but for display in the select menu
                // we have to cap at shorter to fit things, so lets cap it at 20 and add ".." if it was longer
                category_label = (category_label.length > 22) ? category_label.slice(0,19) + '..' : category_label;

                //same for email, it can be up to 128 bytes, but let is cap it at 30 and add '..' if it was longer
                email_label = (email_label.length > 30) ? email_label.slice(0,27) + '..' : email_label;

                // we are going to process this to fit things per console width while showing 
                // category labels, optional other user emails, and the actual text, truncating when neccessary
                // PS after the user selects a text peanut will will show them the full details again
                let formattedLabel = peanut.data ;

                // PS: Clack npm has a problem with multiline support, there is a fix on a PR but it hasnt been merged
                // https://github.com/natemoo-re/clack/pull/143
                // So we can't have multi lines in the select prompt.
                // And console width is dynamic per user/session/window, so we need to account for that
                // Max length of formattedLabel is console_columns - space reserved for label + 
                // optional email display of other user who shared a certain peanut text + the two \t used for padding. 
                // plus the "..." if the truncated text was longer
                // So we must truncate the txt so we dont have a multiline prompt that breaks clack npm.
                // each tab is 8 characters, we got two so 16 characters for the 2 padding tabs
                // and the ... of the truncated text. so around 20 extra characters to account for.
                let max_allowed_length = console_columns - (20 + email_label.length + category_label.length);
                if (formattedLabel.length > max_allowed_length) {
                    formattedLabel = formattedLabel.substring(0, max_allowed_length-1) + color.magenta('...');
                }

                formattedLabel += color.cyan(email_label) + color.black(color.bgGreen(category_label));

                promptList.push({ 
                    label: formattedLabel , 
                    value: "DAT:"+ `${i}:` + peanut.data, // prepend value type, and the index for the metadata
                }); 
            };

            // if not on the last page show next button
            if (currentPage < Math.floor((listLength-1) / MAX_ITEMS_PER_PAGE)) {
                promptList.push({ 
                    label: color.green('Next Page'), 
                    value: "NXT:" + "Next",

                }); 
            } 

            if ((currentPage >= Math.floor((listLength-1) / MAX_ITEMS_PER_PAGE)) && currentPage != 0 ) {
                promptList.push({ 
                    label: color.green('Back Page'), 
                    value: "BAK:" + "Back",
                }); 
            } 

            promptList.push({ 
                label: color.green('List by Category'), 
                value: "CAT:" + "Category",
            });

            const hiddenFolderPath = path.join(os.homedir(), '.peanuts');
            const AIConfFilePath = path.join(hiddenFolderPath, 'ai.json');
        
            // Show this option only if AI Key is present
            if (fs.existsSync(AIConfFilePath)) {
                promptList.push({ 
                    label: color.magenta('Ask AI to find'), 
                    value: "FND:" + "Find",
                });
            }

            promptList.push({ 
                label: color.cyan('Add'), 
                value: "ADD:" + "Add",
            });

            promptList.push({ 
                label: color.yellow('Cancel'), 
                value: "END:" + "Cancel",
            });
            
            // Clack JS prompt, show a list of all peanuts to select from, sorted by latest
            let answer_peanut = await prompts.select({
                message: `Select a peanut (Category of ${(filterCategory == "all:all") ? color.cyan("All") : color.cyan(filterCategory)})`,
                options: promptList
            });

            if (prompts.isCancel(answer_peanut)) {
                console.log(color.yellow("Cancelled"));
                process.exit(0);
            }

            // If this is a data, act on it
            if (answer_peanut.substring(0, 4) == "DAT:") {

                // remove the first 4 control chars and keep the rest
                answer_peanut = answer_peanut.slice(4);

                // extract the index and the data from the answer
                let [metaDataIndex, str] = answer_peanut.split(':');
                str = answer_peanut.substring(answer_peanut.indexOf(':') + 1);

                answer_peanut = str;

                // show the selected command in full (it might have been truncated in the select above)
                console.log(color.green("\n"+answer_peanut));
                // print the full category label and optional user email 
                console.log("\n"+color.bgGreen("#"+peanutList[metaDataIndex].category) + "\t\t" + ( (userEmail != peanutList[metaDataIndex].email) ? color.cyan(peanutList[metaDataIndex].email) : '') ); 
                
                // Clack JS prompt, select an action on the peanut
                answer_action = await prompts.select({
                    message: 'Action',
                    options: [  {value: 'edit' , label: color.green('Edit')},  
                                {value: 'clipboard' , label: color.magenta('Clipboard')}, 
                                {value: 'print' , label: color.magenta('Print')},
                                {value: 'exportPastebin' , label: color.magenta('Export to Pastebin')},
                                {value: 'share' , label: color.blue('Share with user')},
                                {value: 'category' , label: color.blue('Change category')},
                                {value: 'note' , label: color.blue('Edit attached note')},
                                {value: 'ai' , label: color.cyan('Ask AI to explain')},
                                {value: 'execute' , label: color.cyan('# Execute/Open #')},
                                {value: 'cancel' , label: color.yellow('Cancel')},
                                {value: 'delete' , label: color.red('# Delete #')},
                             ]
                    });

                if (prompts.isCancel(answer_action)) {
                    console.log(color.yellow("Cancelled"));
                    process.exit(0);
                }

                // Excute logic of selected action
                switch (answer_action) {

                    // Edit selected peanut text command

                    case 'edit':

                        try {
                            // Read new text
                            var data = await read({prompt: `${color.cyan('\nWrite new commandtext or CTRL+C to cancel:\n')} `});
                            
                            if (data.length == 0){
                                console.log(`${color.yellow("Error: Empty text")}`);
                                continue;
                            }
                            if (data.length > MAX_PEANUT_TEXT_LENGTH) {
                                console.log(`${color.red('Error:')} Command text is too long`);
                                continue;
                            }

                            // Save new text
                            await update(peanutList[metaDataIndex].databaseRef, {data: encryptStringWithPublicKey(user.publicKey, data)});

                            console.log(`${color.green("\nSuccess: Peanut text command updated")}`);

                            continue;

                        } catch (error) {
                            if (error == "Error: canceled")
                                console.log(`${color.yellow("Cancelled")}`);
                            else console.log(`${color.yellow(error)}`);
                            continue;
                        }
                        break;

                    // Export to pastebin
                    case 'exportPastebin':

                        await exportPasteBin(user, db, peanutList[metaDataIndex].data, 'single');

                        continue;
                        break
                    
                    // View, add or edit note attached to command to explain it
                    case 'note':
                        if (peanutList[metaDataIndex].note) console.log("\n" + color.green("Attached Command Note: ") + peanutList[metaDataIndex].note); 
                        else console.log(color.yellow("No note attached to this command. Add one with pnut note"));

                        try {
                            var data = await read({prompt: `${color.cyan('\nWrite new note or CTRL+C to go back to menu:\n')} `});
                            
                            if (data.length == 0){
                                console.log(`${color.yellow("Error: Empty text")}`);
                                continue;
                            }
                            if (data.length > MAX_PEANUT_NOTE_LENGTH) {
                                console.log(`${color.red('Error:')} Note text is too long`);
                                continue;
                            }

                            await update(peanutList[metaDataIndex].databaseRef, {note: data});

                            console.log(`${color.green('\nNote saved.')}`);

                            continue;

                        } catch(error) {
                            if (error == "Error: canceled")
                                console.log(`${color.yellow("Cancelled")}`);
                            else console.log(`${color.yellow(error)}`);
                            continue;
                        }

                        break;
                    
                    // Ask AI to explain the command
                    case 'ai':
                    const hiddenFolderPath = path.join(os.homedir(), '.peanuts');
                    const AIConfFilePath = path.join(hiddenFolderPath, 'ai.json');
                
                    if (fs.existsSync(AIConfFilePath)) {

                        try {
                            const AIConfFile = fs.readFileSync(AIConfFilePath, 'utf8');
                            const AIConf = JSON.parse(AIConfFile);

                            var geminiResponse = await generateGeminiAnswers(answer_peanut, AIConf.apiKey, "explain");

                            console.log("");
                            console.log(color.green(geminiResponse));
                            console.log("");                               
                            continue;

                        } catch(error) {
                            console.log(`${color.red('Error Loading AI Configuration:')} ${error}`);
                            process.exit(1);
                        }
                    }
                    else {
                        console.log(color.yellow(`AI configuration not found. One is needed to infer commands. Add one with pnut ai`));
                        continue;
                    }
                    break;

                    // Chance current text peanut category
                    case 'category':

                        // load categories
                        const categoryRef = ref(db, `users/${firebase_email}/private/categories`);
                        let categoriesList = [];
                        let categories = [];

                        const categorySnapshot = await get(categoryRef);

                        try { 
                            if (categorySnapshot.exists()) {
                                let index = 0;
                                categorySnapshot.forEach(element => {
                                    categories.push({
                                        name: element.val().name,
                                        databaseRef: element.ref
                                    });
                                    categoriesList.push({label: element.val().name, value: `${index}:` + element.val().name});
                                    index++;
                                });
                    
                            } else 
                            categoriesList = []; 
                        } catch(error) {
                            console.log(`${color.red('Error Loading Categories:')} ${error}`);
                            process.exit(1);
                        }
                        categoriesList.reverse(); // latest first

                        categoriesList.push({label: color.yellow('default'), value: '0:default'});

                        let answer_category = await prompts.select({
                            message: 'Select a category',
                            options: categoriesList
                        });

                        if (prompts.isCancel(answer_category)) {
                            console.log(color.yellow("Cancelled"));
                            continue;
                        }

                        let [category_index, category_name] = answer_category.split(':');
                        category_name = answer_category.substring(answer_category.indexOf(':') + 1);

                        // update the category for the selected text peanut item

                        await update(peanutList[metaDataIndex].databaseRef, { category: category_name });

                        console.log(`${color.green('Category Updated:')} ${category_name}`);
                        continue;
                        break;

                    // User cancelled action
                    case 'cancel':
                        console.log(`${color.yellow('Cancelled')}\n`);
                        continue;
                        break;

                    // Share selected peanut with another user
                    // by copying it to their public/pending-texts node path
                    case 'share':
                        const contactsRef = ref(db, `users/${firebase_email}/private/contacts`);
                        let snapshot = await get(contactsRef);

                        try {
                            if (snapshot.exists()) {
                                const propArray = Object.keys(snapshot.val());
                                let promptList = [];

                                propArray.forEach((prop) => {
                                    promptList.push({ label: prop.replace(/\_/g, '.'), value: prop });
                                })
                                // sort promptList alphabetically
                                promptList.sort((a, b) => a.label.localeCompare(b.label));

                                promptList.push({ label: `${color.yellow('Cancel')}`, value: "cancel" });

                                let answer_user = await prompts.select({
                                    message: 'Select a User',
                                    options: promptList
                                });

                                if (prompts.isCancel(answer_user)) {
                                    console.log(color.yellow("Cancelled"));
                                    continue;
                                }

                                if (answer_user == 'cancel') {
                                    console.log(`${color.cyan('Cancelled')}\n`);
                                    continue;
                                }

                                // get the user's publicKey property under users/${answer_user}/public
                                const publicKeyRef = ref(db, `users/${answer_user}/public/publicKey`);
                                snapshot = await get(publicKeyRef);

                                if (snapshot.exists()) {
                                    let publicKey = snapshot.val();

                                    try {
                                    // Copy selected item to user's pending-texts
                                    // and encrypt it with the user's public key
                                    await push(ref(db, `users/${answer_user}/public/pending-text/`), {
                                        data: encryptStringWithPublicKey(publicKey, answer_peanut),
                                        timestamp: serverTimestamp(),
                                        email: userEmail.replace(/\_/g, '.'),
                                        userId: user.uid,
                                        note : encryptStringWithPublicKey(publicKey, peanutList[metaDataIndex].note)
                                    });
                                    console.log(`\n${color.green('\nSuccess:')} Shared with user\n`);
                                    } catch (error) {
                                        //console.error(color.red('Error:'), error);
                                        console.log(color.red("Error: Make sure the other user added you to successfully send them your terminal text peanuts"));
                                        continue;
                                    }

                                    continue;
                                }
                                else {
                                    console.log(`${color.red('Error:')} No active user account found online with email ${userEmail}`);
                                    continue;
                                }     
                            }
                            else {
                                console.log(`${color.red('Error:')} No added users found. Add with the "pnut u" command`);
                                continue;
                            }
                        } catch (error) {
                            console.error(color.red('Error:'), error);
                            process.exit(0);
                        }
                        break;

                    // Copy selected peanut to clipboard
                    case 'clipboard':
                        console.log(`${color.cyan('\nCopied to clipboard, exiting to terminal..')}\n`);
                        clipboard.writeSync(answer_peanut);
                        console.log('\n');
                        process.exit(0);
                        break;

                    // Delete item from firebase
                    case 'delete':
                        console.log(`${color.cyan('\nDeleting..')}\n`);

                        // Confirmation prompt for deletion
                        const shouldDelete = await prompts.confirm({
                            message: 'Are you Sure?',
                        })

                        if (prompts.isCancel(shouldDelete)) {
                            console.log(color.yellow("Cancelled"));
                            process.exit(0);
                        }

                        if (shouldDelete) {
                            // Delete item from firebase
                            try {
                                await remove(peanutList[metaDataIndex].databaseRef);
                                console.log(`${color.cyan('\nDeleted..')}\n`);
                                currentPage = 0;
                                continue;
                            } catch (error) {
                                console.error(error);
                                process.exit(0);
                            }
                        } else {
                            console.log(`${color.cyan('Cancelled')}\n`);
                            continue;
                        }

                    // Execute selected peanut in the terminal
                    case 'execute':
                        console.log(`${color.cyan('\nExecuting..')}\n`);

                        // Confirmation prompt for execution
                        const shouldContinue = await prompts.confirm({
                            message: 'Are you Sure?',
                        });

                        if (prompts.isCancel(shouldContinue)) {
                            console.log(color.yellow("Cancelled"));
                            process.exit(0);
                        }
                        
                        if (shouldContinue) {
                            // run selected peanut text in the terminal and display output
                            try {
                                
                                // detect if string_input is a web link and open in browser
                                if (answer_peanut.startsWith("https://") || answer_peanut.startsWith("http://")) {
                                    console.log("Opening in browser...");
                                    open(answer_peanut);  
                                }
                                else {
                                    // if not try to execute in terminal
                                    console.log("Executing in terminal...");
                                    const output = execSync(answer_peanut, { encoding: 'utf-8' });
                                    console.log(`${color.cyan('\nExecuted..')}\n`);
                                    console.log(output);
                                }

                                process.exit(0);
                            } catch (error) {
                                console.error(error);
                                process.exit(0);
                            }
                        } else {
                            console.log(`${color.yellow('Cancelled')}\n`);
                            process.exit(0);
                        }
                        break;

                    // Print selected peanut to the
                    case 'print':
                        console.log(`${color.cyan('\nPrinting to terminal..')}\n`);
                        console.log(answer_peanut);
                        console.log('\n');
                        process.exit(0);
                        break;
                    default:
                        console.log(`Unsupported action: ${answer_action}`);
                        process.exit(0);
                }
            }
            // View by category
            else if (answer_peanut.substring(0, 4) == "CAT:") {
            
                    // load categories
                    const categoryRef = ref(db, `users/${firebase_email}/private/categories`);
                    let categoriesList = [];
                    let categories = [];

                    const categorySnapshot = await get(categoryRef);

                    try { 
                        if (categorySnapshot.exists()) {
                            let index = 0;
                            categorySnapshot.forEach(element => {
                                categories.push({
                                    name: element.val().name,
                                    databaseRef: element.ref
                                });
                                categoriesList.push({label: element.val().name, value: `DAT:${index}:` + element.val().name});
                                index++;
                            });

                        } else 
                        categoriesList = []; 
                    } catch(error) {
                        console.log(`${color.red('Error Loading Categories:')} ${error}`);
                        process.exit(1);
                    }
                    categoriesList.reverse(); // latest first

                    categoriesList.push({label: `${color.cyan('All')}`, value: "ALL:ALL"});

                    let answer_category = await prompts.select({
                        message: 'Select a category',
                        options: categoriesList
                    });

                    if (prompts.isCancel(answer_category)) {
                        console.log(color.yellow("Cancelled"));
                        continue;
                    }

                    // Check if they selected a category or default ALL
                    if (answer_category.substring(0,4) == "ALL:") {
                        currentPage = 0;
                        filterCategory = "all:all";

                    } else {

                        answer_category = answer_category.slice(4);
                        let [category_index, category_name] = answer_category.split(':');
                        category_name = answer_category.substring(answer_category.indexOf(':') + 1);

                        filterCategory = category_name;
                        currentPage = 0;
                    }
            }
            // If this is a next control, act on it
            else if (answer_peanut.substring(0, 4) == "NXT:") {
                currentPage++;
            }
            else if (answer_peanut.substring(0, 4) == "BAK:") {
                currentPage--;
            }
            else if (answer_peanut.substring(0, 4) == "ADD:") {
                // set the exitBehavior to return to come back to this function
                await stashPeanut (user, db, "return");
            }
            else if (answer_peanut.substring(0, 4) == "FND:") {
                // set the exitBehavior to return to come back to this function
                await aiFind(user, db);
            }
            else if (answer_peanut.substring(0, 4) == "END:") {
                console.log(`${color.yellow('Cancelled')}`);
                process.exit(0);
            }
            
        } else {
            console.log(`${color.cyan('No Peanuts Stashed.')}`);
            process.exit(0);
        }
    }

}

// Pop Latest Peanut
export async function popPeanut(user, db) {
    
    const userEmail = user.email;
    const firebase_email = userEmail.replace(/\./g, '_');

    const peanutRef = ref(db, `users/${firebase_email}/private/peanut-stash`);

    get(peanutRef).then(async (snapshot) => {
        
        if (snapshot.exists()) {

            // get the last/latest child from snapshot
            const peanuts = snapshot.val();
            const keys = Object.keys(peanuts);
            const lastKey = keys[keys.length - 1];

            let decryptedPeanut = decryptStringWithPrivateKey(user.privateKey, peanuts[lastKey].data);

            console.log(`${color.cyan('Popping Last Peanut:')}`);
            console.log(decryptedPeanut);
            process.exit(0);


        } else {
            console.log(`${color.cyan('No Peanuts Stashed.')}`);
            process.exit(1);
        }

    });
}

async function aiFind(user, db, peanuts) {

    const userEmail = user.email;
    const firebase_email = userEmail.replace(/\./g, '_');

    const hiddenFolderPath = path.join(os.homedir(), '.peanuts');
    const AIConfFilePath = path.join(hiddenFolderPath, 'ai.json');

    if (fs.existsSync(AIConfFilePath)) {

        // load api key
        const aiData = fs.readFileSync(AIConfFilePath, 'utf8');
        var aiJSON = JSON.parse(aiData);

        const peanutRef = ref(db, `users/${firebase_email}/private/peanut-stash`);
        let snapshot = await get(peanutRef);
        var peanutList = [];

        if (snapshot.exists()) {
            
            snapshot.forEach((peanut) => {
                
                // Decrypt data with user private key
                let decryptedPeanut = decryptStringWithPrivateKey(user.privateKey, peanut.val().data);
                                
                peanutList.push(decryptedPeanut);
            });
        }

        console.log(color.magenta("Important: Only ask to find a console command you stashed, no other topic, and be concise."));
        console.log(color.magenta("(Gemini will search your entire terminal stash so LLM api key/version context window sizes apply)"));

        try {

            var geminiQuetion = await read({prompt: `${color.cyan('Find my stashed command that.. ')} `});
            if (geminiQuetion.length == 0)
            {
              console.log(`${color.yellow("Error: Empty text")}`);
              process.exit(0);
            }
    
            var geminiResponse = await generateGeminiAnswers(geminiQuetion, aiJSON.apiKey, 'search' , peanutList);
    
            console.log("");
            console.log(color.green(geminiResponse));
            console.log("");

            return;
    
        } catch(error) {
            if (error == "Error: canceled")
                console.log(`${color.yellow("Cancelled")}`);
            else console.log(`${color.yellow(error)}`);
            process.exit(0);
        }

    }
}

