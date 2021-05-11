/*jslint es6 */
"use strict";

// Dependencies
const Discord = require('discord.js');
const FileSystem = require('fs');
const Jsonfile = require('jsonfile');
const Client = new Discord.Client();

// Some variables we're gonna want
var OffersDatabase = __dirname + '/offers_db.json';
var UserDatabase = __dirname + '/users_db.json';
var MainChannel;
var OffersChannel;
var Offers;
var Users;
var UserInteraction = {};

const OfferWriteToDiskThreshold = 10; // How many times offers will be pushed to the Offers array before actually being written to disk (for performance) keep this number low to prevent data loss
const BaseCommandsPerMinuteThreshold = 10; // How many times users will be able to command EVE per miunute.
var DiskWriteIncrement = 0; // Don't touch this, this is for the write threshold

var Permissions = {
    "293701504857276416" : true,
    "214303883894325249" : true
};

// Reading the database files
try {
    Offers = Jsonfile.readFileSync(OffersDatabase);
} catch(Error) {
    console.log("[db] Error when reading offers database file " + Error.Message);
    Offers = {};
    Jsonfile.writeFileSync(OffersDatabase, Offers);
    console.log("[db] Offers database init complete");
}

try {
    Users = Jsonfile.readFileSync(UserDatabase);
} catch(Error) {
    console.log("[db] Error when reading user database file " + Error.Message);
    Users = {}; // Just reset the users thingie since it doesn't exist anyways
    Jsonfile.writeFileSync(UserDatabase, Users);
    console.log("[db] User database init complete");
}

// Other functions we're gonna need
function WriteToOfferDatabaseFile (Callback) {
    Jsonfile.writeFile(OffersDatabase, Offers, {spaces: 2}, function (Error) {
        if (Error) {
            console.log("[err] Error occured trying to write to the offers database.");
        } else {
            console.log("[info] Written to the offers database.");
            if (Callback && typeof Callback == "function") {
                Callback();
            }
        }
    });
}

function WriteToUserDatabaseFile (Callback) {
    Jsonfile.writeFile(UserDatabase, Users, {spaces: 2}, function (Error) {
        if (Error) {
            console.log("[err] Error occured trying to write to the user database! " + Error.Message);
        } else {
            console.log("[info] Written to the user database.");
            if (Callback && typeof Callback == "function") {
                Callback();
            }
        }
    });
}

function GetDiscordUserFromID(ID) {
    return Client.users.get(ID);
}

function SuccessObject(Success, Reason) {
    return {"Success": Success, "Reason": Reason};
}

function AddOffer(Offerer, Title, Description, Price) {

    DiskWriteIncrement++;
    if (DiskWriteIncrement > OfferWriteToDiskThreshold) {
        WriteToOfferDatabaseFile();
        DiskWriteIncrement = 0;
    }

    if (isNaN(Number(Price))) {
        return {"Success": false, "Reason": "Invalid_Price"};
    }

    if (Price > 10000) {
        return {"Success": false, "Reason": "Invalid_Price"};
    }

    if (!Offers[Title]) { // If the title doesn't already exist in offers...

        Offers[Title] = {
            "Offerer": Offerer,
            "Title": Title,
            "Description": Description,
            "Price": Price,
            "Taken": false,
            "Taker": 'None',
            "ConfirmedByOfferer": false,
            "ConfirmedByTaker": false
        };

        // Jsonfile.writeFileSync(OffersDatabase, Offers)
        return {"Success": true, "Reason": "None"};

    } else {
        return {"Success": false, "Reason": "Title_Taken"};
    }
}

function FormatOffer(OfferTitle) {
    var Offer = Offers[OfferTitle];
    return "**" + Offer.Title + "** by **" + GetDiscordUserFromID(Offer.Offerer) + "** - " + Offer.Description + " *(" + Offer.Price + "R$)*";
}

function InitUser(UserID) {
    Users[UserID] = {
        "Reputation": 0,
        "MaxMessagesPerMinute": 10
    };
}

function ModifyUser(UserID, Flag, Value) {
    let User = Users[UserID];
    if (!User) {
        Users[UserID] = {};
        User = Users[UserID]; // Redefine user variable
    }
    User[Flag] = Value;
}

function GetUserFlag(UserID, Flag) {
    return Users[UserID][Flag];
}

function UpdateOffersChannel() {
    OffersChannel.bulkDelete(100);
    var Increment = 1;
    var Display = "";
    for (var Offer in Offers) {
        if (Offers[Offer].Taken != true) {
            Display = Display + FormatOffer(Offers[Offer].Title) + "\n\n"
        }
    }
    OffersChannel.send("**AVAILABLE OFFERS:** \n\n\n" + Display);
}

function CalculateCPM(UserID) {
    return (GetUserFlag(UserID, 'Reputation') * 2) + BaseCommandsPerMinuteThreshold;
}

// All commands are given the Message object as the first argument.
const Commands = {
    "offer": {
        "function": function (Message, Command, Arguments) {
            if (Arguments && Arguments[0] && Arguments[1] && Arguments[2]) {  

                var Success = AddOffer(Message.author.id, Arguments[0], Arguments[1], Arguments[2])

                if (Success.Success) { 
                    Message.reply("Your offer has been created!")
                    Message.channel.send(FormatOffer(Arguments[0]))
                    UpdateOffersChannel()
                } else if (Success.Reason == "Title_Taken") {
                    Message.reply(Arguments[0] + " seems to be taken already. Try and choose another title.")
                } else if (Success.Reason == "Invalid_Price") {
                    Message.reply(Arguments[2] + " is not a valid price. Sorry, try to choose another one.")
                }

            } else {
                Message.reply("`;offer Title | Description | Price` is the proper usage.")
            };

        },
        "help": "Usage: ;offer `Title` | `Description` | `Price`."
    },

    "show-offers": {
        "function": function (Message, Command, Arguments) {
            if (Object.keys(Offers).length > 0) {
                var MessageToDisplay = ""
                for (var Offer in Offers) {
                    if (Offers[Offer].Taken != true) {
                        MessageToDisplay = MessageToDisplay + FormatOffer(Offers[Offer].Title) + "\n\n\n"
                    }
                }
                Message.channel.send("**AVAILABLE OFFERS:** \n\n" + MessageToDisplay);
            } else {
                Message.channel.send("Hi, " + Message.author + "! There are no open offers right now.")
            }
        },
        "help": "Shows all available offers."
    },

    "accept": {
        "function": function (Message, Command, Arguments) {
            if (Arguments[0] && Offers[Arguments[0]]) {
                if (Offers[Arguments[0]].Offerer != Message.author.id && !Offers[Arguments[0]].Taken) {

                    Offers[Arguments[0]].Taken = true;
                    Offers[Arguments[0]].Taker = Message.author.id;
                    Message.reply("You've accepted " + GetDiscordUserFromID(Offers[Arguments[0]].Offerer) + "'s offer. Unfortunately, this is where my job ends and yours starts. Initiate a conversation with them now!")

                    GetDiscordUserFromID(Offers[Arguments[0]].Offerer).send("Hi! It's me, **EVE** again. " + Message.author + " has accepted your offer **(" + Offers[Arguments[0]].Title + ")**! Go ahead and hit them up. :D")
                    UpdateOffersChannel()
                } else if (Offers[Arguments[0]].Taken) {
                    Message.reply("This offer has been taken already.")
                } else {
                    Message.reply("You can't accept your own offer! What are you, fucking gay?")
                }
            } else if (!Offers[Arguments[0]]) {
                Message.reply("You dummy, there's no offer with that name on the list! Maybe you mispelled it?")
            } else {
                Message.reply("You dummy, you didn't say what offer to accept! The correct usage is `;accept OFFER_TITLE_HERE`!")
            }
        },
        "help": "Usage: ;accept `Title`. Accepts offer with this title."
    },

    "confirm": {
        "function": function (Message, Command, Arguments) {
            if (Arguments[0] && Arguments[1]) {
                let Experience = Arguments[1]
                let Offer = Offers[Arguments[0]];
                let ReputationRecipient;
                if (Offer) {
                    if (Offer.Offerer == Message.author.id || Offer.Taker == Message.author.id) {

                        if (Offer.Taken == false) {
                            Message.channel.send("This offer hasn't even been taken yet!")
                            return;
                        }

                        if (Offer.Offerer == Message.author.id) {
                            let Taker = GetDiscordUserFromID(Offer.Taker)
                            Message.channel.send("You've confirmed your offer! This means " + Taker + " has completed their job. Thank you!");
                            Taker.send("Hi! " + GetDiscordUserFromID(Offer.Offerer) + " has confirmed their offer that you took (" + Offer.Title + "). You might want to confirm this as well!");
                            Offer.ConfirmedByOfferer = true;
                            ReputationRecipient = 'Taker';
                        } else {
                            let Taker = GetDiscordUserFromID(Offer.Taker)
                            let Offerer = GetDiscordUserFromID(Offer.Offerer)
                            Message.channel.send("You've completed " + Offerer + "'s offer!")
                            Offerer.send("Hi! " + Taker + " has confirmed your offer that they took (" + Offer.Title + "). You might want to confirm this as well!");
                            Offer.ConfirmedByTaker = true;
                            ReputationRecipient = 'Offerer';
                        }

                        switch (Experience.toLowerCase()) {
                            case 'good':
                                ModifyUser(Offer[ReputationRecipient], "Reputation", GetUserFlag(Offer[ReputationRecipient], "Reputation") + 1);
                                Message.channel.send("You had a good experience with this person. We're going to put that on their record! :D");
                                break;
                            case 'neutral':
                                Message.channel.send("You had an okay experience with this person. Their reputation won't be affected.");
                                break;
                            case 'bad': 
                                Message.channel.send("You had a less than ideal work experience with this person. Don't worry. We'll put this on their record.");
                                ModifyUser(Offer[ReputationRecipient], "Reputation", GetUserFlag(Offer[ReputationRecipient], "Reputation") - 1);
                                break;
                        }

                    } else {
                        Message.channel.send("Sorry, you're not the offerer nor taker of this offer, so you can't do anything with it.")
                        return; 
                    }
                }
            } else {
                Message.channel.send("Sorry, you're missing a couple of arguments. Usage: `confirm Offer-Name | Experience (Good, Neutral or Bad)`");
            }
        },
        "help": "Confirm an offer!"
    },

    "say": {
        "function": function (Message, Command, Arguments) { 
            if (Arguments && typeof Arguments[0] != 'undefined' && typeof Arguments[1] != 'undefined') {
                var Channel = Client.channels.get(Arguments[0])
                Channel.send(Arguments[1])
            } else {
                Message.reply("Hey Einstein, you gotta tell me what to say first.")
            }
        }, 
        "permissions": Permissions,
        "help": "Usage: ;say `ID` | `Message`. Makes the bot say `Message` in Channel `ID`."
    },

    "reset-db": {
        "function": function (Message, Command, Arguments) {
            if (Arguments[0] && Arguments[0] == 'confirm') {
                Offers = {}
                Jsonfile.writeFile(OffersDatabase, {}, function() {
                    Message.reply("Reset the database.")
                })
            } else {
                Message.reply("You must include the `confirm` argument. Cancelling operation!")
            }
        },
        "permissions": Permissions,
        "help": "Resets the in-memory database as well as the file database."
    },

    "reload-offer-channel": {
        "function": function (Message, Command, Arguments) {
            UpdateOffersChannel()
        },
        "permissions": Permissions,
        "help": "Reloads the offer channel in case it didn't reload properly."
    },

    "clear-channel": {
        "function": function (Message, Command, Arguments) {
            if (Arguments[0] && Arguments[1] && Arguments[1] <= 100) {
                var Channel = Client.channels.get(Arguments[0])
                Channel.bulkDelete(Arguments[1])
                Message.reply("Deleted a maximum of " + Arguments[1] + " messages from `" + Channel.name + "`");
            } else {
                Message.reply("Invalid parameters, number of messages must be less than 100, and you must specify a channel ID.")
            }
        },
        "permissions": Permissions,
        "help": "Usage: ;clear-channel `ID`. Clears channel `ID`."
    },

    "write-db": {
        "function": function (Message, Command, Arguments) {
            WriteToOfferDatabaseFile(); 
            console.log("[info] " + Message.author.username + " asked database write to disk. Completed.")
            Message.channel.send("Successful.");
        },
        "permissions": Permissions,
        "help": "Force the bot to rewrite to the database."
    },

    "help": {
        "function": function (Message, Command, Arguments) {
            var CommandsToDisplay = "";
            for (var Command in Commands) {
                CommandsToDisplay = CommandsToDisplay + "`" + Command + "` - " + Commands[Command].help + "\n\n"
            }
            Message.channel.send(CommandsToDisplay);
        },
        "help": "Show all available commands!"
    },

    "stop": {
        "function": function (Message, Command, Arguments) {
            Message.reply("Saving the database...")
            WriteToOfferDatabaseFile(function () {
                process.exit()
            });
        }, 
        "permissions": Permissions,
        "help": "Takes the bot offline."
    },

    "my-stats": {
        "function": function (Message, Command, Arguments) { 
            let UserInteractionEntry = UserInteraction[Message.author.id];
            let UserEntry = Users[Message.author.id];
            if (typeof UserInteractionEntry !== 'undefined' && typeof UserEntry !== 'undefined') {
                Message.channel.send(
                    "What's up? Here are your awesome **EVE** statistics.\n" +
                    "Maximum messages per minute: \`" + GetUserFlag(Message.author.id, 'MaxMessagesPerMinute') + "\`\n" +
                    "Remaining messages for this minute: \`" + (GetUserFlag(Message.author.id, 'MaxMessagesPerMinute') - UserInteraction[Message.author.id]['CommandsPerMinute']) + "\`\n" +
                    "Reputation: \`" + GetUserFlag(Message.author.id, 'Reputation') + "\`\n"
                );
            } else {
                Message.reply("You have no stats recorded yet.");
            }
        },
        "help": "Shows you your current EVE stats."
    },
    
    "reset-spamblocker": {
        "function": function (Message, Command, Arguments) {
            UserInteraction = {};
        },
        "help": "Resets the spam limit on all users",
        "permissions": Permissions
    }
};

Client.on('message', function (Message) {
    if (Message.author.bot) { return; } // Return if the bot is the one messaging.
    if (Message.content.substring(0, 1) == ';') {

        // User check
        if (typeof Users[Message.author.id] === 'undefined') {
            InitUser(Message.author.id);
        }

        // Update this user's stats
        ModifyUser(Message.author.id, 'MaxMessagesPerMinute', GetUserFlag(Message.author.id, 'Reputation') + BaseCommandsPerMinuteThreshold);

        // Commands per minute limit
        let UserInteractionEntry = UserInteraction[Message.author.id];
        if (typeof UserInteractionEntry === 'undefined') {
            UserInteraction[Message.author.id] = {};
            UserInteractionEntry = UserInteraction[Message.author.id]; // Redefine userinteractionentry, this time with the actual table as the variable and not just "undefined"
            UserInteractionEntry['CommandsPerMinute'] = 0;
            UserInteractionEntry['SpamWarned'] = false;
        }
        if (UserInteractionEntry['CommandsPerMinute'] < CalculateCPM(Message.author.id)) {
            UserInteractionEntry['CommandsPerMinute']++;
        } else {
            if (UserInteractionEntry['SpamWarned'] === false) {
                UserInteractionEntry['SpamWarned'] = true;
                Message.reply("You've exceeded the amount of commands you can send to EVE this minute. \nCheck back in a minute and you'll be able to talk to me again!");
                return;
            } else {
                let Reputation = GetUserFlag(Message.author.id, "Reputation");
                if (typeof Reputation == 'number') {
                    Reputation--;
                } else {
                    Reputation = -1
                }
            }
            return;
        }

        if (Message.channel.type != 'dm') {
            Message.delete()
            Message.author.send("Please direct your **EVE** requests to this direct message chat. **EVE** won't work on public chats to prevent messes!")
            return;
        }

        // Removing the semicolon
        var RootMessage = Message.content.substring(1, Message.content.length)

        // Variables
        var Command = RootMessage.match('([^ ]+)')[0];
        var RawArguments = RootMessage.replace(Command, "") // Getting only the arguments
        var Arguments = RawArguments.split('|')

        for (var Argument in Arguments) { // Trim whitespaces
            Arguments[Argument] = Arguments[Argument].trim()
        } 

        console.log("[cmd] " + Message.author.username + " tried to run command '" + Command + "' with arguments " + Arguments)

        // Check if command exists in commands dictionary
        for (var CommandKey in Commands) {
            if (Command.toLowerCase() == CommandKey) {

                if (Commands[CommandKey].permissions) { // If there's a permissions list
                    if (!Commands[CommandKey].permissions[Message.author.id]) {
                        Message.reply("You can't use this command.")
                        console.log("[info] " + Message.author.username + " tried to access command " + Command + ", which they don't have access to.")
                        return
                    }
                }
                console.log("[cmd] Running " + Command + " for " + Message.author.username + " with arguments " + Arguments)
                Commands[CommandKey].function(Message, Command, Arguments)
                return
            } 
        }
        Message.reply("There's no such command found. Sorry!")
    } else if (Message.channel.type == "dm") { 
        console.log("Sending welcome message to " + Message.author.username);
        Message.channel.send("Hi, " + Message.author + "! I'm **EVE**, the Discord bot for all of your Scripter Hiring needs! \nYou can create an offer by typing ;offer in this channel. :D");
    }
});

Client.on('ready', function () {
    console.log("[info] Bot is ready!")
    MainChannel = Client.channels.get('445743745426784256')
    OffersChannel = Client.channels.get('445793848703320064')
    UpdateOffersChannel()
})

process.on('uncaughtException', function (Error) {
    console.log("[err] Uh oh! \n" + Error.stack)
    MainChannel.send("**OH NO. AN ERROR OCCURED.** \n```" + Error.stack + "```")
    return
});

Client.login(process.env.DISCORDTOKEN);
console.log("[info] Logging in!");