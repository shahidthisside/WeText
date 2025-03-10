// State Management
let currentUser = null;
let currentSection = 'match-feed';
let profiles = [];
let matches = [];
let friends = [];
let posts = [];
let friendRequests = [];
let messages = {};
let currentChatUser = null;

// DOM Elements
const authPopup = document.getElementById('login-popup');
const registerPopup = document.getElementById('register-popup');
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const authBtn = document.getElementById('auth-btn');
const authText = document.getElementById('auth-text');
const showRegister = document.getElementById('show-register');
const showLogin = document.getElementById('show-login');
const userAvatar = document.getElementById('profile-avatar');
const profilePopup = document.querySelector('.profile-popup');
const profileUsername = document.getElementById('profile-username');
const profileThought = document.getElementById('profile-thought');
const profileTags = document.getElementById('profile-tags');
const profileMatch = document.getElementById('profile-match');
const profileLikes = document.getElementById('profile-likes');
const profileComments = document.getElementById('profile-comments');
const profileBio = document.getElementById('profile-bio');
const matchCards = document.querySelector('.match-feed');
const commonFeedContent = document.getElementById('common-feed-content');
const weirdFeedContent = document.getElementById('feed');
const matchesSection = document.querySelector('.matches');
const friendsSection = document.querySelector('.friends');
const chatList = document.getElementById('chat-list');
const chatInput = document.getElementById('chat-input');
const chatForm = document.getElementById('chat-form');
const emojiBtn = document.getElementById('emoji-btn');
const emojiPickerContainer = document.querySelector('.emoji-picker-container');
const fileInput = document.getElementById('file-input');
const postInput = document.getElementById('post-input');
const postForm = document.getElementById('post-form');
const anonCheck = document.getElementById('anon-check');
const postBtn = document.getElementById('post-btn');
const thoughtBtn = document.getElementById('thought-btn');
const themeToggle = document.getElementById('theme-toggle');
const usernameSearch = document.getElementById('username-search');
const searchBtn = document.getElementById('search-btn');
const matchFilter = document.getElementById('match-filter');
const matchSort = document.getElementById('match-sort');
const backBtn = document.querySelector('.back-btn');
const clearChatBtn = document.getElementById('clear-chat');
const typingIndicator = document.getElementById('typing-indicator');

// Firebase Authentication and Database
const auth = firebase.auth();
const database = firebase.database();

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
  auth.onAuthStateChanged(user => {
    if (user) {
      currentUser = { ...user, uid: user.uid };
      authText.textContent = 'Logout';
      authBtn.setAttribute('data-action', 'logout');
      console.log('User logged in:', currentUser);
      fetchUserProfile(user.uid);
      fetchProfiles();
      fetchPosts();
      fetchMatches();
      fetchFriends();
      fetchFriendRequests();
    } else {
      authText.textContent = 'Login';
      authBtn.setAttribute('data-action', 'login');
      currentUser = null;
      authPopup.style.display = 'flex';
    }
  });

  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
      if (item.id === 'auth-btn') {
        handleAuthAction();
      } else {
        switchSection(item.getAttribute('data-section'));
        document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
        item.classList.add('active');
      }
    });
  });

  themeToggle.addEventListener('click', () => {
    document.body.classList.toggle('dark-mode');
    document.body.classList.toggle('light-mode');
    themeToggle.classList.toggle('light');
    themeToggle.classList.toggle('dark');
  });

  authBtn.addEventListener('click', handleAuthAction);
  showRegister.addEventListener('click', (e) => { e.preventDefault(); authPopup.style.display = 'none'; registerPopup.style.display = 'flex'; });
  showLogin.addEventListener('click', (e) => { e.preventDefault(); registerPopup.style.display = 'none'; authPopup.style.display = 'flex'; });
  document.querySelectorAll('.close-btn').forEach(btn => btn.addEventListener('click', () => { authPopup.style.display = 'none'; registerPopup.style.display = 'none'; profilePopup.style.display = 'none'; }));

  loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    auth.signInWithEmailAndPassword(email, password).then(userCredential => {
      currentUser = { ...userCredential.user, uid: userCredential.user.uid };
      console.log('User logged in via login form:', currentUser);
      authPopup.style.display = 'none';
    }).catch(error => alert(error.message));
  });

  registerForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const username = document.getElementById('register-username').value;
    const email = document.getElementById('register-email').value;
    const password = document.getElementById('register-password').value;
    const thought = document.getElementById('register-thought').value || '';
    const tags = document.getElementById('register-tags').value || '';
    const bio = document.getElementById('register-bio').value || '';
    auth.createUserWithEmailAndPassword(email, password).then(userCredential => {
      currentUser = { ...userCredential.user, uid: userCredential.user.uid };
      console.log('User registered:', currentUser);
      return database.ref('users/' + currentUser.uid).set({
        username, email, thought, tags, bio,
        avatar: `https://placehold.co/40/8a4af3/ffffff?text=${username.charAt(0).toUpperCase()}`,
        likes: 0, comments: 0, match: Math.floor(Math.random() * 100)
      });
    }).then(() => {
      registerPopup.style.display = 'none';
      fetchUserProfile(currentUser.uid);
    }).catch(error => alert(error.message));
  });

  document.getElementById('edit-profile')?.addEventListener('click', () => { if (currentUser) showProfile(currentUser.uid); });

  chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (currentChatUser && chatInput.value.trim()) {
      sendMessage(chatInput.value);
      chatInput.value = '';
    }
  });

  emojiBtn.addEventListener('click', () => {
    emojiPickerContainer.style.display = emojiPickerContainer.style.display === 'none' ? 'block' : 'none';
  });
  document.querySelector('emoji-picker').addEventListener('emoji-click', event => {
    chatInput.value += event.detail.unicode;
    emojiPickerContainer.style.display = 'none';
  });

  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file && currentChatUser) {
      const reader = new FileReader();
      reader.onload = (event) => sendMessage(`<img src="${event.target.result}" alt="Image" style="max-width: 200px;">`);
      reader.readAsDataURL(file);
      fileInput.value = '';
    }
  });

  postBtn.addEventListener('click', (e) => {
    e.preventDefault();
    postBtn.classList.add('active');
    thoughtBtn.classList.remove('active');
    if (postInput.value.trim() && currentUser) submitPost('post');
  });

  thoughtBtn.addEventListener('click', (e) => {
    e.preventDefault();
    thoughtBtn.classList.add('active');
    postBtn.classList.remove('active');
    if (postInput.value.trim() && currentUser) submitPost('thought');
  });

  searchBtn.addEventListener('click', () => {
    const query = usernameSearch.value.toLowerCase();
    console.log('Search query:', query);
    if (query) {
      const filteredProfiles = profiles.filter(profile => profile.username.toLowerCase().includes(query));
      console.log('Filtered profiles:', filteredProfiles);
      displayFilteredCards(filteredProfiles);
    }
  });

  matchFilter.addEventListener('change', filterProfiles);
  matchSort.addEventListener('change', sortProfiles);

  backBtn.addEventListener('click', () => {
    switchSection('match-feed');
    currentChatUser = null;
    chatList.innerHTML = '<p>Select a match or friend to chat!</p>';
  });

  clearChatBtn.addEventListener('click', () => {
    if (currentChatUser) {
      const chatId = generateChatId(currentUser.uid, currentChatUser.id);
      database.ref('messages/' + chatId).remove();
      chatList.innerHTML = '<p>Chat cleared!</p>';
    }
  });

  chatInput.addEventListener('input', () => {
    if (currentChatUser && chatInput.value.trim()) {
      typingIndicator.textContent = 'Typing...';
      setTimeout(() => { typingIndicator.textContent = ''; }, 2000);
    }
  });

  // Event delegation for dynamic buttons in match cards
  matchCards.addEventListener('click', (e) => {
    const yesBtn = e.target.closest('.yes-btn');
    const noBtn = e.target.closest('.no-btn');
    const friendRequestBtn = e.target.closest('.friend-request-btn');
    if (yesBtn) {
      const card = yesBtn.closest('.card');
      const profile = profiles.find(p => p.username === card.querySelector('h3').textContent);
      if (profile) addToMatches(profile);
    } else if (noBtn) {
      const card = noBtn.closest('.card');
      const profile = profiles.find(p => p.username === card.querySelector('h3').textContent);
      profiles = profiles.filter(p => p.id !== profile.id);
      displayFilteredCards(profiles);
    } else if (friendRequestBtn) {
      const card = friendRequestBtn.closest('.card');
      const profile = profiles.find(p => p.username === card.querySelector('h3').textContent);
      if (profile) sendFriendRequest(profile.id);
    }
  });

  // Event delegation for matches section
  matchesSection.addEventListener('click', (e) => {
    const friendRequestBtn = e.target.closest('.friend-request-btn');
    const chatBtn = e.target.closest('.chat-btn');
    const removeBtn = e.target.closest('.remove-match-btn');
    if (friendRequestBtn) {
      const match = matches.find(m => m.username === e.target.closest('.match').querySelector('h3').textContent);
      if (match) sendFriendRequest(match.id);
    } else if (chatBtn) {
      const match = matches.find(m => m.username === e.target.closest('.match').querySelector('h3').textContent);
      if (match) startChat(match);
    } else if (removeBtn) {
      const match = matches.find(m => m.username === e.target.closest('.match').querySelector('h3').textContent);
      if (match) removeFromMatches(match.id);
    }
  });

  // Event delegation for friends section
  friendsSection.addEventListener('click', (e) => {
    const chatBtn = e.target.closest('.chat-btn');
    const removeBtn = e.target.closest('.remove-friend-btn');
    const acceptBtn = e.target.closest('.accept-btn');
    const rejectBtn = e.target.closest('.reject-btn');
    if (chatBtn) {
      const friend = friends.find(f => f.username === e.target.closest('.friend').querySelector('h3').textContent);
      if (friend) startChat(friend);
    } else if (removeBtn) {
      const friend = friends.find(f => f.username === e.target.closest('.friend').querySelector('h3').textContent);
      if (friend) removeFriend(friend.id);
    } else if (acceptBtn) {
      const requestId = acceptBtn.getAttribute('data-request-id');
      acceptFriendRequest(requestId);
    } else if (rejectBtn) {
      const requestId = rejectBtn.getAttribute('data-request-id');
      rejectFriendRequest(requestId);
    }
  });

  // Event delegation for Common Feed
  commonFeedContent.addEventListener('click', (e) => {
    const yesBtn = e.target.closest('.yes-btn');
    const noBtn = e.target.closest('.no-btn');
    if (yesBtn) {
      const postElement = yesBtn.closest('.post');
      const username = postElement.querySelector('h3').textContent;
      if (username === 'Anonymous') {
        alert('Cannot add anonymous users to matches.');
        return;
      }
      database.ref('users').orderByChild('username').equalTo(username).once('value', snapshot => {
        if (snapshot.exists()) {
          snapshot.forEach(childSnapshot => {
            const profile = childSnapshot.val();
            profile.id = childSnapshot.key;
            addToMatches(profile);
          });
        } else {
          alert('User not found.');
        }
      });
    } else if (noBtn) {
      const postElement = noBtn.closest('.post');
      const postId = postElement.getAttribute('data-post-id');
      posts = posts.filter(p => p.id !== postId);
      renderPosts();
    }
  });

  // Event delegation for Weird Feed
  weirdFeedContent.addEventListener('click', (e) => {
    const yesBtn = e.target.closest('.yes-btn');
    const noBtn = e.target.closest('.no-btn');
    if (yesBtn) {
      const postElement = yesBtn.closest('.post');
      const username = postElement.querySelector('h3').textContent;
      if (username === 'Anonymous') {
        alert('Cannot add anonymous users to matches.');
        return;
      }
      database.ref('users').orderByChild('username').equalTo(username).once('value', snapshot => {
        if (snapshot.exists()) {
          snapshot.forEach(childSnapshot => {
            const profile = childSnapshot.val();
            profile.id = childSnapshot.key;
            addToMatches(profile);
          });
        } else {
          alert('User not found.');
        }
      });
    } else if (noBtn) {
      const postElement = noBtn.closest('.post');
      const postId = postElement.getAttribute('data-post-id');
      posts = posts.filter(p => p.id !== postId);
      renderWeirdFeed();
    }
  });
});

function handleAuthAction() {
  const action = authBtn.getAttribute('data-action');
  if (action === 'login') authPopup.style.display = 'flex';
  else if (action === 'logout') {
    auth.signOut().then(() => {
      currentUser = null;
      authText.textContent = 'Login';
      authBtn.setAttribute('data-action', 'login');
      matchCards.innerHTML = '';
      commonFeedContent.innerHTML = '';
      weirdFeedContent.innerHTML = '';
      matchesSection.innerHTML = '<h2>Your Matches</h2>';
      friendsSection.innerHTML = '<h2>Your Friends</h2>';
      chatList.innerHTML = '<p>Select a match or friend to chat!</p>';
    }).catch(error => alert(error.message));
  }
}

function switchSection(sectionId) {
  document.querySelectorAll('section').forEach(section => section.classList.remove('active'));
  document.getElementById(sectionId).classList.add('active');
  currentSection = sectionId;
}

function fetchUserProfile(uid) {
  database.ref('users/' + uid).once('value', snapshot => {
    const userData = snapshot.val();
    if (userData) {
      currentUser = { ...currentUser, ...userData, id: uid, uid: currentUser.uid };
      console.log('Updated currentUser after fetch:', currentUser);
      userAvatar.src = userData.avatar;
      userAvatar.onerror = () => {
        console.warn('Failed to load avatar, using fallback image');
        userAvatar.src = 'https://placehold.co/40/8a4af3/ffffff?text=U';
      };
      profileUsername.textContent = userData.username;
      profileThought.textContent = userData.thought;
      profileTags.textContent = userData.tags;
      profileMatch.textContent = userData.match;
      profileLikes.textContent = userData.likes;
      profileComments.textContent = userData.comments;
      profileBio.textContent = userData.bio;
    } else {
      console.warn('No user data found for UID:', uid);
    }
  }, error => console.error('Error fetching user profile:', error));
}

function fetchProfiles() {
  database.ref('users').once('value', snapshot => {
    profiles = [];
    if (!snapshot.exists()) {
      console.log('No profiles found in the database.');
      displayInitialSearchUI();
      return;
    }
    snapshot.forEach(childSnapshot => {
      const user = childSnapshot.val();
      user.id = childSnapshot.key;
      if (user.id !== currentUser?.id && !matches.some(m => m.id === user.id) && !friends.some(f => f.id === user.id)) {
        profiles.push(user);
      }
    });
    console.log('Fetched profiles:', profiles);
    displayInitialSearchUI();
  }, error => {
    console.error('Error fetching profiles:', error);
    alert('Failed to fetch profiles. Please check your connection and try again.');
    displayInitialSearchUI();
  });
}

function fetchPosts() {
  database.ref('posts').on('value', snapshot => {
    posts = [];
    snapshot.forEach(childSnapshot => {
      const post = childSnapshot.val();
      post.id = childSnapshot.key;
      posts.push(post);
    });
    console.log('Fetched posts:', posts);
    renderPosts();
    renderWeirdFeed();
  }, error => console.error('Error fetching posts:', error));
}

function fetchMatches() {
  if (!currentUser || !currentUser.uid) {
    console.warn('Cannot fetch matches: currentUser or uid is missing:', currentUser);
    return;
  }
  database.ref('matches/' + currentUser.uid).on('value', snapshot => {
    matches = [];
    if (!snapshot.exists()) {
      console.log('No matches found.');
      renderMatches();
      return;
    }
    snapshot.forEach(childSnapshot => {
      const match = childSnapshot.val();
      match.id = childSnapshot.key;
      if (!matches.some(m => m.id === match.id)) {
        matches.push(match);
      }
    });
    console.log('Fetched matches:', matches);
    renderMatches();
  }, error => console.error('Error fetching matches:', error));
}

function fetchFriends() {
  if (!currentUser || !currentUser.uid) {
    console.warn('Cannot fetch friends: currentUser or uid is missing:', currentUser);
    return;
  }
  database.ref('friends/' + currentUser.uid).on('value', snapshot => {
    friends = [];
    if (!snapshot.exists()) {
      console.log('No friends found.');
      renderFriends();
      return;
    }
    const friendPromises = [];
    snapshot.forEach(childSnapshot => {
      const friend = childSnapshot.val();
      friend.id = childSnapshot.key;
      friendPromises.push(
        database.ref('users/' + friend.id).once('value').then(friendSnapshot => {
          const friendData = friendSnapshot.val();
          if (friendData) {
            return { ...friendData, id: friend.id };
          }
          return null;
        })
      );
    });
    Promise.all(friendPromises).then(friendResults => {
      friends = friendResults.filter(friend => friend !== null);
      console.log('Fetched friends:', friends);
      renderFriends();
    }).catch(error => console.error('Error fetching friends details:', error));
  }, error => console.error('Error fetching friends:', error));
}

function fetchFriendRequests() {
  if (!currentUser || !currentUser.uid) {
    console.warn('Cannot fetch friend requests: currentUser or uid is missing:', currentUser);
    return;
  }
  database.ref('friend_requests/' + currentUser.uid).on('value', async snapshot => {
    friendRequests = [];
    if (!snapshot.exists()) {
      console.log('No friend requests found.');
      renderFriendRequests();
      return;
    }
    const requestPromises = [];
    snapshot.forEach(childSnapshot => {
      const request = childSnapshot.val();
      request.id = childSnapshot.key;
      requestPromises.push(
        database.ref('users/' + request.id).once('value').then(requestSnapshot => {
          const requesterData = requestSnapshot.val();
          if (requesterData) {
            return { ...requesterData, id: request.id, status: request.status || 'pending' };
          }
          return null;
        })
      );
    });
    try {
      const requestResults = await Promise.all(requestPromises);
      friendRequests = requestResults.filter(request => request !== null);
      console.log('Fetched friend requests:', friendRequests);
      renderFriendRequests();
    } catch (error) {
      console.error('Error fetching friend requests details:', error);
    }
  }, error => console.error('Error fetching friend requests:', error));
}

function displayInitialSearchUI() {
  matchCards.innerHTML = `
    <h2>Find Your Weird</h2>
    <div class="search-bar">
      <input type="text" id="username-search" placeholder="Search by username..." />
      <button id="search-btn"><i class="fas fa-search"></i></button>
    </div>
    <div class="filters">
      <select id="match-filter">
        <option value="all">All</option>
        <option value="tags">By Tags</option>
        <option value="likes">By Likes</option>
        <option value="match">By Match %</option>
      </select>
      <select id="match-sort">
        <option value="none">Sort By</option>
        <option value="match-desc">Match % (High to Low)</option>
        <option value="match-asc">Match % (Low to High)</option>
        <option value="username">Username (A-Z)</option>
      </select>
    </div>
  `;
  document.getElementById('search-btn').addEventListener('click', () => {
    const query = document.getElementById('username-search').value.toLowerCase();
    console.log('Search query:', query);
    if (query) {
      const filteredProfiles = profiles.filter(profile => profile.username.toLowerCase().includes(query));
      console.log('Filtered profiles:', filteredProfiles);
      displayFilteredCards(filteredProfiles);
    }
  });
  document.getElementById('match-filter').addEventListener('change', filterProfiles);
  document.getElementById('match-sort').addEventListener('change', sortProfiles);
}

function displayFilteredCards(filteredProfiles) {
  matchCards.innerHTML = `
    <h2>Find Your Weird</h2>
    <div class="search-bar">
      <input type="text" id="username-search" placeholder="Search by username..." />
      <button id="search-btn"><i class="fas fa-search"></i></button>
    </div>
    <div class="filters">
      <select id="match-filter">
        <option value="all">All</option>
        <option value="tags">By Tags</option>
        <option value="likes">By Likes</option>
        <option value="match">By Match %</option>
      </select>
      <select id="match-sort">
        <option value="none">Sort By</option>
        <option value="match-desc">Match % (High to Low)</option>
        <option value="match-asc">Match % (Low to High)</option>
        <option value="username">Username (A-Z)</option>
      </select>
    </div>
  `;
  if (filteredProfiles.length === 0) {
    matchCards.innerHTML += '<p>No matching profiles found.</p>';
  } else {
    filteredProfiles.forEach(profile => {
      const card = document.createElement('div');
      card.className = 'card';
      card.innerHTML = `
        <h3>${profile.username}</h3>
        <p><strong>Thought:</strong> ${profile.thought}</p>
        <p><strong>Tags:</strong> ${profile.tags}</p>
        <p><strong>Match:</strong> ${profile.match}%</p>
        <div class="buttons">
          <button class="yes-btn">Yes</button>
          <button class="no-btn">No</button>
          <button class="friend-request-btn">Send Friend Request</button>
        </div>
      `;
      matchCards.appendChild(card);
    });
  }
  document.getElementById('search-btn').addEventListener('click', () => {
    const query = document.getElementById('username-search').value.toLowerCase();
    console.log('Search query:', query);
    if (query) {
      const filteredProfiles = profiles.filter(profile => profile.username.toLowerCase().includes(query));
      console.log('Filtered profiles:', filteredProfiles);
      displayFilteredCards(filteredProfiles);
    }
  });
  document.getElementById('match-filter').addEventListener('change', filterProfiles);
  document.getElementById('match-sort').addEventListener('change', sortProfiles);
}

function filterProfiles() {
  let filteredProfiles = [...profiles];
  const filter = matchFilter.value;
  if (filter === 'tags' && currentUser?.tags) {
    filteredProfiles = filteredProfiles.filter(profile => profile.tags && profile.tags.toLowerCase().includes(currentUser.tags.toLowerCase()));
  } else if (filter === 'likes') {
    filteredProfiles.sort((a, b) => (b.likes || 0) - (a.likes || 0));
  } else if (filter === 'match') {
    filteredProfiles.sort((a, b) => b.match - a.match);
  }
  sortProfiles(filteredProfiles);
}

function sortProfiles(filteredProfiles = profiles) {
  const sort = matchSort.value;
  if (sort === 'match-desc') filteredProfiles.sort((a, b) => b.match - a.match);
  else if (sort === 'match-asc') filteredProfiles.sort((a, b) => a.match - b.match);
  else if (sort === 'username') filteredProfiles.sort((a, b) => a.username.localeCompare(b.username));
  displayFilteredCards(filteredProfiles);
}

function addToMatches(profile) {
  if (!currentUser || !currentUser.uid || !profile || !profile.id) {
    console.error('Cannot add to matches: No current user or profile ID:', { currentUser, profile });
    alert('Please log in to add matches.');
    return;
  }

  // Check if the profile is the current user
  if (profile.id === currentUser.uid) {
    console.warn('Cannot add yourself to matches:', profile.id);
    alert('You cannot add yourself to matches!');
    return;
  }

  // Check if the profile is already in matches
  if (matches.some(match => match.id === profile.id)) {
    console.warn('Profile is already in matches:', profile.id);
    alert('Already in matches!');
    return;
  }

  console.log('Adding to matches:', currentUser.uid, 'with profile:', profile.id);
  database.ref('matches/' + currentUser.uid + '/' + profile.id).set({
    username: profile.username,
    match: profile.match,
    id: profile.id
  }).then(() => {
    matches.push(profile);
    renderMatches();
    console.log('Added to matches:', profile);
    alert('Added to matches!');
  }).catch(error => {
    console.error('Error adding to matches:', error);
    alert('Failed to add to matches. Check console for details.');
  });
}

function removeFromMatches(matchId) {
  if (!currentUser || !currentUser.uid || !matchId) {
    console.error('Cannot remove from matches: No current user or match ID:', { currentUser, matchId });
    alert('Please log in to remove matches.');
    return;
  }

  database.ref('matches/' + currentUser.uid + '/' + matchId).remove().then(() => {
    console.log('Removed from matches:', matchId);
    matches = matches.filter(match => match.id !== matchId);
    renderMatches();
  }).catch(error => {
    console.error('Error removing from matches:', error);
    alert('Failed to remove from matches. Check console for details.');
  });
}

function renderPosts() {
  commonFeedContent.innerHTML = '';
  posts.filter(post => post.type === 'post').forEach(post => {
    const postElement = document.createElement('div');
    postElement.className = 'post';
    postElement.setAttribute('data-post-id', post.id);
    postElement.innerHTML = `
      <h3>${post.username || 'Anonymous'}</h3>
      <p>${post.content}</p>
      <p><strong>Type:</strong> ${post.type}</p>
      <p><strong>Tags:</strong> ${post.tags}</p>
      <p><strong>Posted at:</strong> ${post.timestamp}</p>
      <div class="buttons">
        <button class="like-btn">Like (${post.likes || 0})</button>
        <button class="comment-btn">Comment</button>
        <button class="yes-btn">Yes</button>
        <button class="no-btn">No</button>
      </div>
    `;
    commonFeedContent.appendChild(postElement);
  });
  if (!commonFeedContent.innerHTML) commonFeedContent.innerHTML = '<p>No posts in Common Feed.</p>';
}

function renderWeirdFeed() {
  weirdFeedContent.innerHTML = '';
  posts.filter(post => post.type === 'thought').forEach(post => {
    const postElement = document.createElement('div');
    postElement.className = 'post';
    postElement.setAttribute('data-post-id', post.id);
    postElement.innerHTML = `
      <h3>${post.username || 'Anonymous'}</h3>
      <p>${post.content}</p>
      <p><strong>Type:</strong> ${post.type}</p>
      <p><strong>Tags:</strong> ${post.tags}</p>
      <p><strong>Posted at:</strong> ${post.timestamp}</p>
      <div class="buttons">
        <button class="like-btn">Like (${post.likes || 0})</button>
        <button class="comment-btn">Comment</button>
        <button class="yes-btn">Yes</button>
        <button class="no-btn">No</button>
      </div>
    `;
    weirdFeedContent.appendChild(postElement);
  });
  if (!weirdFeedContent.innerHTML) weirdFeedContent.innerHTML = '<p>No thoughts in Weird Feed.</p>';
}

function renderMatches() {
  matchesSection.innerHTML = '<h2>Your Matches</h2>';
  const uniqueMatches = Array.from(new Map(matches.map(match => [match.id, match])).values());
  uniqueMatches.forEach(match => {
    const matchElement = document.createElement('div');
    matchElement.className = 'match';
    matchElement.innerHTML = `
      <h3>${match.username}</h3>
      <p><strong>Match:</strong> ${match.match}%</p>
      <div class="buttons">
        <button class="friend-request-btn">Send Friend Request</button>
        <button class="chat-btn">Chat</button>
        <button class="remove-match-btn">Remove</button>
      </div>
    `;
    matchesSection.appendChild(matchElement);
  });
  if (!matchesSection.innerHTML.includes('match')) matchesSection.innerHTML += '<p>No matches yet.</p>';
}

function renderFriends() {
  friendsSection.innerHTML = '<h2>Your Friends</h2>';
  friends.forEach(friend => {
    const friendElement = document.createElement('div');
    friendElement.className = 'friend';
    friendElement.innerHTML = `
      <h3>${friend.username}</h3>
      <div class="buttons">
        <button class="chat-btn">Chat</button>
        <button class="remove-friend-btn">Remove</button>
      </div>
    `;
    friendsSection.appendChild(friendElement);
  });
  renderFriendRequests();
}

function renderFriendRequests() {
  const requestsContainer = document.createElement('div');
  requestsContainer.innerHTML = '<h2>Your Friend Requests</h2>';
  if (friendRequests.length === 0) {
    requestsContainer.innerHTML += '<p>No friend requests.</p>';
  } else {
    friendRequests.forEach(request => {
      const requestElement = document.createElement('div');
      requestElement.className = 'friend-request';
      requestElement.innerHTML = `
        <h3>${request.username}</h3>
        <div class="buttons">
          <button class="accept-btn" data-request-id="${request.id}">Accept</button>
          <button class="reject-btn" data-request-id="${request.id}">Reject</button>
        </div>
      `;
      requestsContainer.appendChild(requestElement);
    });
  }
  const existingRequests = friendsSection.querySelector('.friend-requests');
  if (existingRequests) existingRequests.remove();
  requestsContainer.className = 'friend-requests';
  friendsSection.appendChild(requestsContainer);
}

function submitPost(type) {
  const content = postInput.value;
  const anonymous = anonCheck.checked;
  if (content && currentUser) {
    const post = {
      userId: currentUser.uid,
      username: anonymous ? 'Anonymous' : currentUser.username,
      content, timestamp: new Date().toLocaleString(),
      type, tags: currentUser.tags || '', likes: 0, comments: []
    };
    database.ref('posts').push(post).then(() => {
      console.log('Post saved:', post);
      postInput.value = '';
      anonCheck.checked = false;
    }).catch(error => console.error('Error saving post:', error));
  }
}

function showProfile(uid) {
  fetchUserProfile(uid);
  profilePopup.style.display = 'flex';
}

function sendFriendRequest(friendId) {
  if (!currentUser || !currentUser.uid || !friendId) {
    console.error('Cannot send friend request: No current user or friend ID:', { currentUser, friendId });
    alert('Please log in to send a friend request.');
    return;
  }

  const isAlreadyFriend = friends.some(friend => friend.id === friendId);
  if (isAlreadyFriend) {
    console.warn('User is already a friend:', friendId);
    alert('Already friends!');
    return;
  }

  database.ref('friend_requests/' + friendId + '/' + currentUser.uid).once('value', snapshot => {
    if (snapshot.exists()) {
      console.warn('Friend request already exists for:', friendId);
      alert('A friend request is already pending for this user.');
      return;
    }
    console.log('Sending friend request from:', currentUser.uid, 'to:', friendId);
    database.ref('friend_requests/' + friendId + '/' + currentUser.uid).set({
      username: currentUser.username,
      status: 'pending'
    }).then(() => {
      console.log('Friend request sent successfully to:', friendId);
      fetchFriendRequests();
    }).catch(error => {
      console.error('Error sending friend request:', error);
      alert('Failed to send friend request. Check console for details.');
    });
  });
}

function acceptFriendRequest(requestId) {
  const request = friendRequests.find(r => r.id === requestId);
  if (request) {
    database.ref('friends/' + currentUser.uid + '/' + request.id).set({
      username: request.username
    }).then(() => {
      console.log('Added friend to current user:', currentUser.uid, 'with friend ID:', request.id);
    }).catch(error => console.error('Error adding friend to current user:', error));

    database.ref('friends/' + request.id + '/' + currentUser.uid).set({
      username: currentUser.username
    }).then(() => {
      console.log('Added current user to friend:', request.id, 'with username:', currentUser.username);
    }).catch(error => console.error('Error adding current user to friend:', error));

    database.ref('friend_requests/' + currentUser.uid + '/' + request.id).remove().then(() => {
      console.log('Friend request removed for:', request.id);
      fetchFriends();
      fetchFriendRequests();
    }).catch(error => console.error('Error removing friend request:', error));
  }
}

function rejectFriendRequest(requestId) {
  database.ref('friend_requests/' + currentUser.uid + '/' + requestId).remove().then(() => {
    console.log('Friend request rejected for:', requestId);
    fetchFriendRequests();
  }).catch(error => console.error('Error rejecting friend request:', error));
}

function removeFriend(friendId) {
  if (!currentUser || !currentUser.uid || !friendId) {
    console.error('Cannot remove friend: No current user or friend ID:', { currentUser, friendId });
    alert('Please log in to remove a friend.');
    return;
  }
  database.ref('friends/' + currentUser.uid + '/' + friendId).remove().then(() => {
    console.log('Removed friend from current user:', currentUser.uid, 'friend ID:', friendId);
  }).catch(error => console.error('Error removing friend from current user:', error));

  database.ref('friends/' + friendId + '/' + currentUser.uid).remove().then(() => {
    console.log('Removed current user from friend:', friendId, 'user ID:', currentUser.uid);
  }).catch(error => console.error('Error removing current user from friend:', error));

  fetchFriends();
}

function generateChatId(userId1, userId2) {
  return [userId1, userId2].sort().join('_');
}

function startChat(user) {
  currentChatUser = user;
  const chatId = generateChatId(currentUser.uid, user.id);
  console.log('Starting chat with:', user.username, 'Chat ID:', chatId);
  database.ref('messages/' + chatId + '/users').set({
    [currentUser.uid]: true,
    [user.id]: true
  }).then(() => {
    switchSection('chat-section');
    document.querySelector('.chat-header h2').textContent = `Chat with ${user.username}`;
    renderChat(chatId);
  }).catch(error => console.error('Error setting up chat:', error));
}

function sendMessage(message) {
  if (!currentChatUser || !currentUser) {
    console.error('No current chat user or current user:', { currentChatUser, currentUser });
    return;
  }
  const chatId = generateChatId(currentUser.uid, currentChatUser.id);
  console.log('Sending message to chat ID:', chatId, 'Message:', message);
  const messageData = {
    userId: currentUser.uid,
    username: currentUser.username,
    content: message,
    timestamp: new Date().toLocaleString()
  };
  database.ref('messages/' + chatId + '/messages').push(messageData).then(() => {
    console.log('Message sent successfully:', messageData);
  }).catch(error => {
    console.error('Error sending message:', error);
    alert('Failed to send message. Check console for details.');
  });
}

function renderChat(chatId) {
  chatList.innerHTML = '';
  if (currentChatUser) {
    database.ref('messages/' + chatId + '/messages').on('value', snapshot => {
      chatList.innerHTML = '';
      if (!snapshot.exists()) {
        chatList.innerHTML = '<p>Start the conversation!</p>';
        return;
      }
      snapshot.forEach(childSnapshot => {
        const msg = childSnapshot.val();
        const msgElement = document.createElement('div');
        msgElement.className = 'message ' + (msg.userId === currentUser.uid ? 'sent' : 'received');
        msgElement.innerHTML = `<p>${msg.username}: ${msg.content} <span class="timestamp">${msg.timestamp}</span></p>`;
        chatList.appendChild(msgElement);
      });
      chatList.scrollTop = chatList.scrollHeight;
      console.log('Chat updated for chatId:', chatId);
    }, error => console.error('Error fetching messages:', error));
  } else {
    chatList.innerHTML = '<p>Select a match or friend to chat!</p>';
  }
}