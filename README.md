# Peanut Stash 1.0.6 

### Description:
Collaborative command line cloud Stash, Share, Copy & Paste tool.

Quickly stash, pop, send & receive console commands and text with your team.
Helpful tiny secure tool for coders, IT and devops who work frequently within the terminal.

Unlike pastebin and its 3rd party tools/ecosystem, this tool and project is more focused on quick efficient terminal commands stashing/sharing and not on code sharing.

License: MIT

![](https://github.com/roymasad/peanut-stash/blob/b98590830ec3fa2e806bb850a484cd6253c693e9/console.gif)

##### Requirements:

Nodejs 20+

Firebase project (Optional)

Requires access to internet

##### Development Installation:

npm install

Note: to test/work using  yourlocal firebase emulator servers (firebase + authentication)
You have edit config/local-testing-server.env and put your own local emulator IDs

##### NPM Installation:

npm i -g peanut-stash

[npm.com](https://www.npmjs.com/package/peanut-stash)

#####  Command:

pnut

#### Arguments Usage:

* register (r) <email>                     Register new account
* login (i) <email>                        Login
* logout (o)                               Logout
* reset (rs)                               Reset password

* users (u)                                Manage all connected users

* categories (c)                           Manage categories

* server (sv)                              Use default or custom firebase server (web app creds)

* stash (s)                                Stash a text peanut
* pop (p)                                  Pop stashed text. Asks to display, copy or exec
* list (l)                                 Use and manage all stashed peanuts

* about (a)                                About Page

#### Examples:

pnut stash  
(or shorthand) 
pnut s 
(then type or paste your terminal text, ie : adb shell pm list packages -e) 

pnut list
(forward/use/delete)

pnut pop
(get the last stashed text peanut)

### Features:

* Cloud based collaborative copy pasting of terminal commands (peanuts!)
* Requires an account with email verification
* Ready out of the box to try out
* Access your stash of commands anywhere you can login
* Stash, retrieve, open, execute, categorise, clipboard copy, share console strings quickly with colleagues
* Works on firebase free spark plan, you just need realtime DB and Auth with email enabled
* Manage users to share text peanut with
* Manage category labels to filter/organize your text peanuts
* Simple cloud design requires no server logic/functions/api endpoints
* Supports private servers (works on firebase free Spark plan)
* RSA used to secure encryption of peanut texts
* Symmetrical encryption for login credentials based on machine signatures
* Color codded interactive prompts
* Firebase realtime db security rules for autherization and access control of data
* Public testing server with the project (read below notes)

#### Config & troubleshooting

peanut saves under $user/.peanuts its configuration files (login and custom server)
In case of uses, such as using wrong custom server config, you can remove those files to reset it

#### Must Read, Important Notes:

Currently the app runs by default on a public testing server, so no need to set one up initially to check it.

That said, use your own firebase server if/when you are working on production and sharing important text items. (private server siloed for your own team/group)
It is very easy to do so, you just need to create a new firebase project (spark or blaze) and enable authentiction with emails and realtime database only.
The current security rules for the realtime database are in the repo, use them. 

After each user of the group needs to use the web app project Ids and load them once into peanuts cli with approripate server argument. (you only need 4 of them, check default-public-server.env for the ones required)

The provided default testing server with peanuts works out of the box and is only for quick testing convience as it is multi tenant and others might be testing. It also is hosted on a free Firebase Spark plan that has quota limitations and is not guarantted to be always secure, maintained or upgraded. Neither myself nor the project will be liable to any breaches/problems in the future for your data on a testing proof of concept server. 
By continuing to use the default test server you agree to those terms and take personal responsiblity. The testing database is under development, things might get deleted/refactored and data privacy cannot be provided. Again, don't share any private/sensitive content on it or use it for work, use your own firebase server it takes 5 mins to set up.

If you are interested in contributing additional features, ideas, enhacements or fixing issues pertaining to the project, you are welcome to fork this repo and create pull requests directly.
Certain intentionally missing features like using custom access tokens to login will require additional server api deployment/budget/server/architecture and therefore are only fit for forks/clone repos for teams who need this functionality and have already the paid servers to deploy on. The testing server will not be upgraded to a paid plan to support this or any other features that require payments or additional servers/deployments. Also on the public test server to mitigate abuse, the google cloud identity tool kit's API "Queries per minute per user" quota is reduced from 30000 to 512. Everything else is turned off or throttled down with quotas substantially. Additionally the firebase Spark plan provides a limited combined 1GB DB capacity.

In this spirit, the design of is that of a purely client logic/architecture on the main branch which can access the realtime firebase database directly from the node app without going through API server endpoints or any paid features. (and the pros and cons that comes with this approach). Firebase admin sdk cannot be used in such a project since we arent using server modules and for security reasons can't use the admin sdk in an unsecure public client environment.


# Roadmap for versions 1.0.6+:

* Add comments to text peanuts
* Add unit testing
* Refactor to use a providers class
* Add offline stash support (will require providers class)
* Add bulk stash import (from files)
* Support interface for different serverless providers like supabase (will require providers class)
* Support interface for rest api endpoints (will require providers class)
* Complementary chrome brower extension pluging side project (different repo/project probably)
* Add support for group team sharing
* Support public mass sharing similar to pastebin (using unique public id of text)
* Publish pacakge on homebrew (and nuget ?)
* Add a RAG type AI prompt that helps you quickly search for lists and find a peanut
* Add LLM prompt AI that explains to you what each text peanut does and can refactor it
  
  
