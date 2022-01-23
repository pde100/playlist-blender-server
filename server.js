require('dotenv').config()
const express = require('express');
const SpotifyWebApi = require('spotify-web-api-node');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
app.use(cors())
app.use(bodyParser.json());

let {PythonShell} = require('python-shell')

//key=sessionCode, value=Session Object
var mapOfSessions = new Map();

//key=email, value=User Object
var userMap = new Map();

app.post('/createPlaylist', (req, res) => {
    const userEmail = req.body.email
    const seshCode = req.body.seshCode
    var currSession = mapOfSessions.get(seshCode)
    var currUser = userMap.get(userEmail)
    var userAccessToken = currUser.accessToken
    currSession.updateEverything()
    console.log(currSession.recTracks.length)

    console.log(currSession.recTracks) 

    const spotifyApi = new SpotifyWebApi({
        redirectUri: process.env.REDIRECT_URI,
        clientId: process.env.CLIENT_ID,
        clientSecret: process.env.CLIENT_SECRET,
    })

    var userNames = []
    for(let i = 0; i < currSession.userDisplayList.length; i++) {
        userNames.push(currSession.userDisplayList[i][0])
    }

    spotifyApi.setAccessToken(userAccessToken)
    spotifyApi.createPlaylist(currUser.username + "'s Group Playlist", { 'description': 'This playlist contains recommendations from ' + userNames, 'public': true })
    .then(function(data) {
      console.log('Created playlist!');
      console.log("id is "+ data.body.id)
      spotifyApi.addTracksToPlaylist(data.body.id, currSession.recTracks)
      .then(function(data) {
        console.log('Added tracks to playlist!');
      }, function(err) {
        console.log('Something went wrong!', err);
      });
    }, function(err) {
      console.log('Something went wrong!', err);
    });

    mapOfSessions.delete(seshCode)

    //console.log(currSession.topArtists)


    
  

    

})



app.post('/removeUser', (req, res) => {
    const clientEmail = req.body.email
    const clientSessionCode = req.body.seshCode

    var currSession = mapOfSessions.get(clientSessionCode)
    var index = currSession.userList.indexOf(clientEmail)
    currSession.userList.splice(index, 1)
    var displayName = userMap.get(clientEmail).username
    var displayImages = userMap.get(clientEmail).images
    index = currSession.userDisplayList.indexOf([displayName, displayImages])
    currSession.userDisplayList.splice(index, 1)

})

app.post('/sessionUpdate', (req, res) => {
    const clientEmail = req.body.email
    const clientSessionCode = req.body.seshCode

    //sort people into sessions and stuff
    currUser = userMap.get(clientEmail)
    if(!mapOfSessions.has(clientSessionCode)) {
        mapOfSessions.set(clientSessionCode, new Session(clientSessionCode))
    }
    currSession = mapOfSessions.get(clientSessionCode)
    if(currSession.userList.indexOf(currUser.email) < 0) {
        currSession.addUser(currUser)     
    }   

    

    res.json({
        sessionMembers: currSession.userList,
        sessionMembersDisplay: currSession.userDisplayList
    })
})

app.post('/refresh',(req, res) => {
    const refreshToken = req.body.refreshToken
    const spotifyApi = new SpotifyWebApi({
        redirectUri: process.env.REDIRECT_URI,
        clientId: process.env.CLIENT_ID,
        clientSecret: process.env.CLIENT_SECRET,
        refreshToken, 
    })

    //update user with corresponding email with new access token

    spotifyApi.refreshAccessToken().then(
        (data) => {
            res.json({
                accessToken: data.body.access_token,
                expiresIn: data.body.expires_in
            }) 

            //my code 
            var accessToken = data.body.access_token;
            spotifyApi.setAccessToken(data.body.access_token);
            spotifyApi.getMe().then(data => {
                userMap.get(data.body.email).accessToken = accessToken;
            })

        }).catch(err => {
        console.log(err)
        res.sendStatus(400)
        })

})


app.post('/login', (req, res) => {
    const code = req.body.code
    const spotifyApi = new SpotifyWebApi({
        redirectUri: process.env.REDIRECT_URI,
        clientId: process.env.CLIENT_ID,
        clientSecret: process.env.CLIENT_SECRET,
    })
    
    spotifyApi.authorizationCodeGrant(code).then(grantdata => {
        //my code
        var accessToken = grantdata.body.access_token;
        var userEmail;
        var displayName;
        spotifyApi.setAccessToken(accessToken); 
        
        spotifyApi.getMe().then(data => {
            //creating a user and populating personalization info
            var curr = new User(data.body.display_name, data.body.email, accessToken, data.body.images);
            userMap.set(curr.email, curr)
            userEmail = curr.email
            displayName = data.body.display_name
            curr.updateArtists()
            curr.updateUserTracks()

            res.json({
                accessToken: grantdata.body.access_token,
                refreshToken: grantdata.body.refresh_token,
                expiresIn: grantdata.body.expires_in,
                userEmail: userEmail,
                displayname: displayName,
                pfp: data.body.images[0]
            })
        }).catch(err => {
            console.log('error with spotify api')
            console.log(err)
            res.sendStatus(400)
        })

        //
        
    }).catch(err => {
        console.log('error with login')
        console.log(err)
        res.sendStatus(400)
    }) 

})

app.listen(3001)


// all my classes



function User(username, email, accessToken, images) {
    this.images = images;
    this.username = username;
    this.email = email;
    this.accessToken = accessToken;
    this.topArtists = new Set();
    this.topTracks = new Set();
    this.songRecs = new Set();
    this.updateArtists = updateArtists;
    this.updateUserTracks = updateUserTracks;
}

function updateArtists() {
    const spotifyApi = new SpotifyWebApi({
        redirectUri: process.env.REDIRECT_URI,
        clientId: process.env.CLIENT_ID,
        clientSecret: process.env.CLIENT_SECRET,
    })
    
    spotifyApi.setAccessToken(this.accessToken);
    spotifyApi.getMyTopArtists().then(data => {
        var artistData = data.body.items
        for(let i = 0; i < artistData.length; i++) {
            //TODO: change this to push artist id instead of name
            this.topArtists.add(artistData[i].name)

            spotifyApi.getRecommendations({
                discoverability: 9,
                min_popularity: 40,
                target_popularity: 50,
                limit: 80,
                seed_artists: [artistData[i].id]
            }).then(artistSong => {
                //change this to .id
                this.songRecs.add(artistSong.body.tracks[Math.floor(Math.random() * artistSong.body.tracks.length)].id)
            })
        }
    })

}

function updateUserTracks() {
    const spotifyApi = new SpotifyWebApi({
        redirectUri: process.env.REDIRECT_URI,
        clientId: process.env.CLIENT_ID,
        clientSecret: process.env.CLIENT_SECRET,
    })
    
    spotifyApi.setAccessToken(this.accessToken);
    spotifyApi.getMyTopTracks().then(data => {
        var trackData = data.body.items
        var tempList = [];
        for(let i = 0; i < trackData.length; i++) {
            //TODO: change this to push track id instead of name
            this.topTracks.add(trackData[i])
            tempList.push(trackData[i].id)
            //adds 2-3 songs from original 5 songs
            if(Math.floor(Math.random() * 5) == 0) {
                this.songRecs.add(trackData[i].id)
            }
            if(i % 5 === 0) {
                spotifyApi.getRecommendations({
                    discoverability: 9,
                    min_popularity: 40,
                    target_popularity: 50,
                    limit: 1,
                    seed_tracks: tempList
                }).then(trackSongs => {
                    //change this to .id
                    for(let j = 0; j < trackSongs.body.tracks.length; j++) {
                        //change this to id
                        this.songRecs.add(trackSongs.body.tracks[j].id)
                        
                    }
                })
                tempList = [];
            }

        }  
        
        

    })

    //add code to do recs for the trackList

}



function Session(securityCode) {
    this.securityCode = securityCode;
    this.userList = [];
    this.userDisplayList = [];
    //key=name of artist, track, genre value=frequency
    this.recTracks = [];
    this.addUser = addUser;
    this.updateEverything = updateEverything
}

function updateEverything() {
    for(let i = 0; i < this.userList.length; i++) {
        var newUser = userMap.get(this.userList[i]);

        for(let track of newUser.songRecs) {
            this.recTracks.push("spotify:track:"+track);
        }
    
    
        
    }

}


function addUser(newUser) {
    this.userList.push(newUser.email)
    this.userDisplayList.push([newUser.username, newUser.images])


    /*
    this code should be somewhere in createplaylist method

    for(let track of newUser.topTracks) {
        if(this.topTracks.has(track)) {
            this.topTracks.set(track, this.topTracks.get(track) + 1)
        } else {
            this.topTracks.set(track, 1)
        }
    }

    for(let genre of newUser.topGenres) {
        if(this.topGenres.has(genre)) {
            this.topGenres.set(genre, this.topGenres.get(genre) + 1)
        } else {
            this.topGenres.set(genre, 1)
        }
    }

    for(let artist of newUser.topArtists) {
        if(this.topArtists.has(artist)) {
            this.topArtists.set(artist, this.topArtists.get(artist) + 1)
        } else {
            this.topArtists.set(artist, 1)
        }
    }

    */

}




