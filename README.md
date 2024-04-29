# Peanut Stash 1.0.0 

### Description:
Collaborative command line cloud Stash, Share, Copy & Paste tool.

Quickly stash, pop, send & receive console commands and text with your team.
Helpful tiny tool for coders, IT and devops who work frequently within the terminal.

Unlike pastebin and its 3rd party tools/ecosystem, this tool and project is more focused on quick efficient terminal commands stashing/sharing and not on code sharing.

License: MIT

##### Requirements:

Nodejs 20+

Firebase project (Optional)

Requires access to internet

##### Installation:

npm i -g peanut-stash-cli

#####  Command:

pnut

##### NPM:

[npm.com](https://www.npmjs.com/package/peanut-stash-cli)

#### Arguments Usage:

* register (r) <email>                     Register new account
* login (i) <email>                        Login
* logout (o)                               Logout
* reset (rs)                               Reset password

* users (u)                                Manage all connected users (active/pending)

* server (sv) firebase.json                Use your custom firebase server json file (TODO)
* server (sv) default                      Use default provided testing firebase server(TODO)

* stash (s) <peanut data>                  Stash a text peanut
* pop (p)                                  Pop stashed text. Asks to display, copy or exec(TODO)
* list (l)                                 Manage all stashed peanuts

* about (a)                                About Page

#### Examples:

pnut stash  
(or shorthand) 
pnut s 
(then type or paste your terminal text like : adb shell pm list packages -e) 

pnut list
(forward/use/delete)

pnut pop
(get the lasted one, stash or received, and do an action on it)

### Features:

* Cloud based collaborative copy pasting of terminal commands (peanuts)
* Ready out of the box
* Account your stash of commands anywhere you can login
* Stash, retrieve, open, execute, categorise, clipboard copy, share strings quickly with colleagues
* Manage users to share text peanut with
* Manage category labels to filter/organize your text peanuts
* Simple cloud design requires no server logic/functions/api endpoints
* Supports private servers (works on firebase free Spark plan)
* RSA used to secure encryption of peanut texts
* Symmetrical encryption for login credentials based on machine signatures
* Color codded interactive prompts
* Firebase realtime db security rules for autherization and access control of data
* Public testing server with the project (read below notes)

#### Must Read, Important Notes:

Currently the app runs by default on testing servers, so no need to set one up initially.

That said, use your own firebase server if/when you are working on production and sharing important text items. (private server siloed for your team/group)
It is very easy to do so, you just need to create a new firebase project (spark or blaze) and enable auth with emails and realtime database.
The current security rules for the realtime database are in the repo.

After each user of the group needs to download the json and load it once into peanuts cli with approripate server argument.


The provided default testing server with peanuts works out of the box and is only for quick testing convience as it is multi tenant. It also is hosted on a free Firebase Spark plan that has quota limitations and is not guarantted to be always secure, maintained or upgraded. Neither myself or the project will be liable to any breaches in the future. 
By continuing to use the default test server you agree to these terms and take personal responsiblity. The testing database is under development, things might get deleted/refactored and data privacy cannot be provided. Don't share any private/sensitive content on it.

If you are interested in contributing additional features or fixing issues to the project, you are welcome to fork this repo and create pull requests.
Certain intentionally missing features like using custom access tokens to login will require additional server api deployment/budget/server and therefore are only fit for forks/clone repos to teams who need this functionality and have already the paid servers to deploy on. The testing server will not be upgraded to a paid plan to support this or other features that require payments or additional servers/deployments.

In this spirit the design client logic/architecture on the main branch is to access the realtime firebase database directly from the node app without going through API server endpoints. (and the pros and cons that comes with this approach). Firebase admin sdk cannot be used in such a project.


#### TODO for version 1.0.0:

* Implement 'pop' argument
* Implement 'server' argument to import/use custom firebase project 
* Change text peanuts categories option
* Filter text peanuts by categories option
* Add interactive stashing (looping prompts)
* Add bulk stash import (from files)
* Add gif animation of example usage to readme.md
* Add unit testing

# Roadmap for versions 1.1.+:

* Add comments to text peanuts
* Refactor to use a providers class
* Add offline stash support (will require providers class)
* Support interface for different serverless providers like supabase (will require providers class)
* Support interface for rest api endpoints (will require providers class)
* Complementary chrome brower extension pluging side project (different repo/project probably)
* Add support for group team sharing
* Support public mass sharing similar to pastebin (using unique public id of text)
* Publish pacakge on homebrew (and nuget ?)
* Add a RAG type AI prompt that helps you quickly search for lists and find a peanut
* Add LLM prompt AI that explains to you what each text peanut does and can refactor it
  
  
