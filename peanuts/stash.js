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
import { question } from 'readline-sync';

import {MAX_ITEMS_PER_PAGE, MAX_PEANUT_TEXT_LENGTH} from './consts.js';

import {  encryptStringWithPublicKey, 
    decryptStringWithPrivateKey, 
    fetchJsonAPI } from './utilities.js';

// Save user's data text 'peanut' to his list/stash of peanuts
export async function stashPeanut (user, db) {

    // variables and constants for the loop
    const uid = user.uid;
    const userEmail = user.email;
    const firebase_email = userEmail.replace(/\./g, '_');

    // load categories we can use to stash under
    const categoryRef = ref(db, `users/${firebase_email}/private/categories`);
    
    let categoriesList = []; // for display initially
    let categoriesListCopy = []; // for display to manage, slightly different content
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
    // make a copy of categoriesList for management (without default/manage)
    categoriesListCopy = categoriesList.slice();

    // add default category with suffix
    categoriesList.unshift({label: color.yellow("default"), value: "DAT:-1:default"}); //top
    categoriesList.push({label: color.cyan("#Manage#"), value: "MNG:manage"}); //bottom

    do {
        // text to stash
        let data = question(`${color.cyan('\nType or Paste your terminal text to stash:\n')} `);

        // Metadata to add to text are timestamp and user id/email
        // get the firebase server timestamp no the local one
        let timestamp = serverTimestamp();
    
        // Clack JS prompt, show a list of all peanuts to select from, sorted by latest
        let answer_category = await prompts.select({
            message: 'Select a category',
            options: categoriesList
        });
    
        // Check if we directly got an answer or are going to manage categories
        if (answer_category == "MNG:manage") {
    
            // Append add category option
            categoriesListCopy.push({label: color.cyan("#Add#"), value: "ADD:add"});
    
            let manage_category = await prompts.select({
                message: 'Select a category',
                options: categoriesListCopy
            });
    
            if (manage_category == "ADD:add") {
                let answer = question(`${color.cyan('\Add a new category:\n')} `);
                // select it
                selectedCategory = answer;
                // save it to database
                await push(categoryRef,{ name : answer });
            } else {
    
                // use it or delete i selected category
                let manage_action = await prompts.select({
                    message: 'Select Action',
                    options: [
                        {label: "Select", value: "select"},
                        {label: `${color.yellow("#Delete#")}`, value: "delete"},
                    ]
                });
    
                // user
                if (manage_action == "select") {
                    // select and remove prefix
                    manage_category = manage_category.slice(4);
                    // remove index, disgard i
                    let [index, category] = manage_category.split(':');
                    selectedCategory = category;
                }
                // delete and use default
                else if (manage_action == "delete") {
                    // select and remove prefix
                    manage_category = manage_category.slice(4);
                    // get database ref to remove
                    let [metaDataIndex, category] = manage_category.split(':');
                    await remove(categories[metaDataIndex].databaseRef);
                    
                    selectedCategory = "default";
                    console.log(`${color.green('Removed.')} Selecting default`);
                }
            }
            
        } else {
            // select and remove prefix
            selectedCategory = answer_category.slice(4);
            // remove index, disgard i
            let [index, category] = selectedCategory.split(':');
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
        // to optimize/secure database storay space, setting it to 2048 here and in the security rules 
    
        // check that data is not bigger than 4096 bytes
        if (data.length > MAX_PEANUT_TEXT_LENGTH) {
            console.log(`${color.red('Error:')} Peanut text is too long`);
            process.exit(1);
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
            console.log(`${color.green('Peanut stashed:')} ${data}`);

        }
        catch (error) {
            console.error(`${color.red('Error saving peanut :')} ${error}`);
            process.exit(1);
        }
        
        console.log(color.yellow("Peanut Stashed. Add another or CTRL+C to exit"));
    } while (true)
    
}

// List available peanuts for this user
// PS peanuts texts shared form other users will have to be copied here to be used and encrypted
export async function listPeanuts(user, db) {

    const userEmail = user.email;
    const firebase_email = userEmail.replace(/\./g, '_');

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

    // Read data from the database
    get(peanutRef).then(async (snapshot) => {
        
        if (snapshot.exists()) {
            
            // Convert snapshot to an array of values
            const peanutList = [];

            snapshot.forEach((peanut) => {
                
                // Decrypt data with user private key
                let decryptedPeanut = decryptStringWithPrivateKey(user.privateKey, peanut.val().data);
                
                peanutList.push({
                    data:  decryptedPeanut,
                    timestamp: peanut.val().timestamp,
                    email: peanut.val().userEmail,
                    userId: peanut.val().uid,
                    category: peanut.val().category,
                    databaseRef: peanut.ref
                    });
            });

            // Reverse the loaded array to have the latest items first
            peanutList.reverse();

            // Enable pagination of the loaded list
            const listLength = peanutList.length;
            const maxItemsPerPage = MAX_ITEMS_PER_PAGE;
            let currentPage = 0;

            // Clack JS compatible prompt list
            let promptList;
            let answer_action;
                
            while (true) {

                promptList = [];
                answer_action = null;

                // show current page items, pagination system

                // while not on the last page, the item_length is maxItemsPerPage - 1
                // else the items_length is the rest of the list
                let items_length = (currentPage < Math.floor(listLength / maxItemsPerPage)) ? 
                                maxItemsPerPage : listLength - (currentPage * maxItemsPerPage);

                
                // loop and fill the page items from the loaded list
                for (let    i = 0 + (currentPage * maxItemsPerPage); 
                            i < items_length+ (currentPage * maxItemsPerPage); i++) {

                    let peanut = peanutList[i];

                    // Show user email if the peanut is shared by another user
                    // Don't show the email if it is the user's peanut

                    let email_label = "\t\t" +( (peanut.email != user.email) ? ` (${peanut.email})` : '');
                    let category_label = "\t\t" + ((peanut.category != 'default') ? ` #${peanut.category}` : '');

                    let formattedLabel = peanut.data + color.cyan(email_label) + color.white(color.bgGreen(category_label));

                    promptList.push({ 
                        label: formattedLabel , 
                        value: "DAT:"+ `${i}:` + peanut.data, // prepend value type, and the index for the metadata
                    }); 
                };

                // if not on the last page show next button
                if (currentPage < Math.floor(listLength / maxItemsPerPage)) {
                    promptList.push({ 
                        label: color.cyan('Next Page'), 
                        value: "NXT:" + "Next",
    
                    }); 
                    promptList.push({ 
                        label: color.yellow('Cancel'), 
                        value: "END:" + "Cancel",
                    });
                } else {
                    promptList.push({ 
                        label: color.yellow('Cancel'), 
                        value: "END:" + "Cancel",
                    });
                }


                // Clack JS prompt, show a list of all peanuts to select from, sorted by latest
                let answer_peanut = await prompts.select({
                    message: 'Select a peanut',
                    options: promptList
                });

                // If this is a data, act on it
                if (answer_peanut.substring(0, 4) == "DAT:") {
 
                    // remove the first 4 control chars and keep the rest
                    answer_peanut = answer_peanut.slice(4);

                    // extract the index and the data from the answer
                    const [metaDataIndex, str] = answer_peanut.split(':');

                    answer_peanut = str;
                    
                    // Clack JS prompt, select an action on the peanut
                    answer_action = await prompts.select({
                        message: 'Action',
                        options: [  {value: 'clipboard' , label: 'Clipboard'}, 
                                    {value: 'print' , label: 'Print'},
                                    {value: 'share' , label: color.blue('Share with user')},
                                    {value: 'cancel' , label: color.yellow('Cancel')},
                                    {value: 'delete' , label: color.red('# Delete #')},
                                    {value: 'execute' , label: color.cyan('# Execute/Open #')}, ]
                        });

                    // Excute logic of selected action
                    switch (answer_action) {

                        // User cancelled action
                        case 'cancel':
                            console.log(`${color.cyan('\nCancelled..')}\n`);
                            process.exit(0);
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

                                    if (answer_user == 'cancel') {
                                        console.log(`${color.cyan('\nCancelled..')}\n`);
                                        process.exit(0);
                                    }

                                    // get the user's publicKey property under users/${answer_user}/public
                                    const publicKeyRef = ref(db, `users/${answer_user}/public/publicKey`);
                                    snapshot = await get(publicKeyRef);

                                    let publicKey = snapshot.val();

                                    // Copy selected item to user's pending-texts
                                    // and encrypt it with the user's public key
                                    await push(ref(db, `users/${answer_user}/public/pending-text/`), {
                                        data: encryptStringWithPublicKey(publicKey, answer_peanut),
                                        timestamp: serverTimestamp(),
                                        email: userEmail.replace(/\_/g, '.'),
                                        userId: user.uid,
                                    });
                                    console.log(`\n${color.green('\nSuccess:')} Shared with user\n`);
                                    process.exit(0);
                                }
                                else {
                                    console.log(`${color.red('Error:')} No contacts found`);
                                    process.exit(0);
                                }
                            } catch (error) {
                                console.error(color.red('Error:'), error);
                                process.exit(0);
                            }


                            process.exit(0);
                            break;

                        // Copy selected peanut to clipboard
                        case 'clipboard':
                            console.log(`${color.cyan('\nCopied to clipboard..')}\n`);
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

                            if (shouldDelete) {
                                // Delete item from firebase
                                try {
                                    await remove(peanutList[metaDataIndex].databaseRef);
                                    console.log(`${color.cyan('\nDeleted..')}\n`);
                                    process.exit(0);
                                } catch (error) {
                                    console.error(error);
                                    process.exit(0);
                                }
                            } else {
                                console.log(`${color.cyan('\nCancelled..')}\n`);
                                process.exit(0);
                            }

                        // Execute selected peanut in the terminal
                        case 'execute':
                            console.log(`${color.cyan('\nExecuting..')}\n`);

                            // Confirmation prompt for execution
                            const shouldContinue = await prompts.confirm({
                                message: 'Are you Sure?',
                            });
                            
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
                                console.log(`${color.cyan('\nCancelled..')}\n`);
                                process.exit(0);
                            }
                            break;

                        // Print selected peanut to the
                        case 'print':
                            console.log(`${color.cyan('\nPrinted..')}\n`);
                            console.log(answer_peanut);
                            console.log('\n');
                            process.exit(0);
                            break;
                        default:
                            console.log(`Unsupported action: ${answer_action}`);
                            process.exit(0);
                    }
                }
                // If this is a next control, act on it
                else if (answer_peanut.substring(0, 4) == "NXT:") {
                    currentPage++;
                }
                else if (answer_peanut.substring(0, 4) == "END:") {
                    console.log(`${color.cyan('Cancelled.')}`);
                    process.exit(0);
                }
            }

            process.exit(0);
        } else {
            console.log(`${color.cyan('No Peanuts Stashed.')}`);
            process.exit(1);
        }

    })

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

