// ============= CONFIGURATION =============
const API_URL = 'https://workload-monitor-2.onrender.com';
let authToken = null;
let currentUser = null;
let currentTeamId = null;
let currentTeam = null;
let editMemberId = null;
let pieChart = null;
let barChart = null;

// ============= WORKLOAD CALCULATION =============
function calculateWorkloadScore(tasks, hours) {
    let hoursScore = 0;
    let tasksScore = 0;
    
    if (hours <= 35) {
        hoursScore = (hours / 35) * 30;
    } else if (hours <= 45) {
        hoursScore = 30 + ((hours - 35) / 10) * 30;
    } else if (hours <= 55) {
        hoursScore = 60 + ((hours - 45) / 10) * 25;
    } else {
        hoursScore = 85 + Math.min(15, (hours - 55) / 5 * 15);
    }
    
    if (tasks <= 15) {
        tasksScore = (tasks / 15) * 15;
    } else if (tasks <= 25) {
        tasksScore = 15 + ((tasks - 15) / 10) * 15;
    } else if (tasks <= 35) {
        tasksScore = 30 + ((tasks - 25) / 10) * 10;
    } else {
        tasksScore = 40;
    }
    
    let finalScore = (hoursScore * 0.6) + (tasksScore * 0.4);
    
    if (hours > 45 && tasks > 30) finalScore += 8;
    if (hours > 50 && tasks > 35) finalScore += 10;
    if (hours > 55) finalScore += 7;
    
    return Math.min(100, Math.max(0, Math.round(finalScore)));
}

function getWorkloadLevel(score) {
    if (score >= 70) return "High";
    if (score >= 35) return "Normal";
    return "Low";
}

function getStatusMessage(level, hours, tasks) {
    if (level === "High") {
        if (hours > 55) return "🔥 CRITICAL - Severe Burnout Risk!";
        if (hours > 48) return "⚠️ URGENT - High Overload Risk";
        return "⚠️ Elevated Workload - Monitor Closely";
    }
    if (level === "Low") {
        if (hours < 20) return "📉 Very Low - Available for More";
        return "✅ Underutilized - Can Take More";
    }
    return "✓ Balanced - Optimal Performance";
}

// ============= API HELPER =============
async function apiCall(endpoint, method, data = null) {
    const headers = {
        'Content-Type': 'application/json',
    };
    
    const options = {
        method: method,
        headers: headers
    };
    
    if (data) {
        options.body = JSON.stringify(data);
    }
    
    const response = await fetch(`${API_URL}${endpoint}`, options);
    const result = await response.json();
    
    if (!response.ok) {
        throw new Error(result.error || 'API call failed');
    }
    
    return result;
}

// ============= AUTHENTICATION =============
window.handleLogin = async function() {
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    
    if (!email || !password) {
        alert('Please enter email and password');
        return;
    }
    
    try {
        const result = await apiCall('/api/auth/login', 'POST', { email, password });
        authToken = result.token;
        currentUser = result.user;
        localStorage.setItem('authToken', authToken);
        localStorage.setItem('currentUser', JSON.stringify(currentUser));
        alert('Login successful!');
        showTeamSelection();
    } catch (error) {
        alert('Login failed: ' + error.message);
    }
}

window.handleSignup = async function() {
    const name = document.getElementById('signupName').value.trim();
    const email = document.getElementById('signupEmail').value.trim();
    const password = document.getElementById('signupPassword').value;
    
    if (!name || !email || !password) {
        alert('Please fill all fields');
        return;
    }
    
    if (password.length < 6) {
        alert('Password must be at least 6 characters');
        return;
    }
    
    try {
        const result = await apiCall('/api/auth/signup', 'POST', { name, email, password });
        authToken = result.token;
        currentUser = result.user;
        localStorage.setItem('authToken', authToken);
        localStorage.setItem('currentUser', JSON.stringify(currentUser));
        alert('Account created successfully!');
        showTeamSelection();
    } catch (error) {
        alert('Signup failed: ' + error.message);
    }
}

window.showSignup = function() {
    document.getElementById('loginForm').style.display = 'none';
    document.getElementById('signupForm').style.display = 'block';
}

window.showLogin = function() {
    document.getElementById('loginForm').style.display = 'block';
    document.getElementById('signupForm').style.display = 'none';
}

window.logout = function() {
    authToken = null;
    currentUser = null;
    currentTeamId = null;
    currentTeam = null;
    localStorage.removeItem('authToken');
    localStorage.removeItem('currentUser');
    document.getElementById('dashboardScreen').style.display = 'none';
    document.getElementById('teamSelectScreen').style.display = 'none';
    document.getElementById('authScreen').style.display = 'flex';
}

// ============= TEAM MANAGEMENT =============
async function showTeamSelection() {
    const storedUser = localStorage.getItem('currentUser');
    if (storedUser && !currentUser) {
        currentUser = JSON.parse(storedUser);
    }
    
    document.getElementById('authScreen').style.display = 'none';
    document.getElementById('teamSelectScreen').style.display = 'flex';
    document.getElementById('dashboardScreen').style.display = 'none';
    await renderTeamsList();
}

async function renderTeamsList() {
    const container = document.getElementById('teamsList');
    
    if (!currentUser || !currentUser.teams || currentUser.teams.length === 0) {
        container.innerHTML = '<div class="empty-state"><i class="fas fa-users"></i><p>No teams yet. Create or join one below!</p></div>';
        return;
    }
    
    let html = '<h3 style="margin-bottom: 15px;">📁 Your Teams</h3>';
    
    for (let team of currentUser.teams) {
        html += `
            <div class="team-option" onclick="selectTeam('${team.id}')">
                <h3><i class="fas fa-users"></i> ${escapeHtml(team.name)}</h3>
                <p>${escapeHtml(team.description || 'No description')}</p>
                <span class="join-code">Join Code: ${team.join_code}</span>
            </div>
        `;
    }
    container.innerHTML = html;
}

window.createTeam = async function() {
    const teamName = document.getElementById('newTeamName').value.trim();
    const description = document.getElementById('teamDescription').value.trim();
    
    if (!teamName) {
        alert('Please enter a team name');
        return;
    }
    
    try {
        const team = await apiCall('/api/teams', 'POST', { 
            user_id: currentUser.id,
            name: teamName, 
            description: description 
        });
        
        if (!currentUser.teams) currentUser.teams = [];
        currentUser.teams.push(team);
        localStorage.setItem('currentUser', JSON.stringify(currentUser));
        
        alert(`Team "${teamName}" created!\nJoin Code: ${team.join_code}`);
        
        document.getElementById('newTeamName').value = '';
        document.getElementById('teamDescription').value = '';
        
        currentTeamId = team.id;
        await loadTeamData();
        loadDashboard();
    } catch (error) {
        alert('Error: ' + error.message);
    }
}

window.joinTeam = async function() {
    const joinCode = document.getElementById('joinTeamId').value.trim().toUpperCase();
    
    if (!joinCode) {
        alert('Please enter a join code');
        return;
    }
    
    try {
        const team = await apiCall('/api/teams/join', 'POST', { 
            user_id: currentUser.id,
            join_code: joinCode 
        });
        
        if (!currentUser.teams) currentUser.teams = [];
        currentUser.teams.push(team);
        localStorage.setItem('currentUser', JSON.stringify(currentUser));
        
        alert(`Joined "${team.name}"!`);
        
        document.getElementById('joinTeamId').value = '';
        
        currentTeamId = team.id;
        await loadTeamData();
        loadDashboard();
    } catch (error) {
        alert('Error: ' + error.message);
    }
}

window.selectTeam = async function(teamId) {
    currentTeamId = teamId;
    await loadTeamData();
    loadDashboard();
}

async function loadTeamData() {
    if (!currentTeamId) return;
    try {
        currentTeam = await apiCall(`/api/teams/${currentTeamId}`, 'GET');
        console.log('Team loaded:', currentTeam.name);
    } catch (error) {
        console.error('Error loading team:', error);
    }
}

// ============= DASHBOARD FUNCTIONS =============
function loadDashboard() {
    document.getElementById('teamSelectScreen').style.display = 'none';
    document.getElementById('dashboardScreen').style.display = 'block';
    document.getElementById('currentTeamName').innerHTML = `<i class="fas fa-users"></i> ${currentTeam.name} <span class="join-code" style="margin-left: 10px;">Code: ${currentTeam.join_code}</span>`;
    updateDashboardUI();
}

function updateDashboardUI() {
    const members = currentTeam.members_data || [];
    
    if (members.length === 0) {
        document.getElementById('avgWorkloadScore').innerText = '0';
        document.getElementById('overloadedCount').innerText = '0';
        document.getElementById('teamSizeCount').innerText = '0';
    } else {
        const totalScore = members.reduce((sum, m) => sum + (m.workloadScore || 0), 0);
        const avg = Math.round(totalScore / members.length);
        const overloaded = members.filter(m => m.level === 'High').length;
        document.getElementById('avgWorkloadScore').innerText = avg;
        document.getElementById('overloadedCount').innerText = overloaded;
        document.getElementById('teamSizeCount').innerText = members.length;
    }
    
    renderTeamTable();
    updateCharts();
    updateAlert();
}

function renderTeamTable() {
    const tbody = document.getElementById('teamTableBody');
    const members = currentTeam.members_data || [];
    
    if (members.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="empty-state-table">No members yet. Add your first team member! 🚀</td><\/tr>';
        return;
    }
    
    let html = '';
    for (let m of members) {
        const levelClass = m.level === 'High' ? 'high' : (m.level === 'Normal' ? 'normal' : 'low');
        const status = getStatusMessage(m.level, m.hours, m.tasks);
        const riskIcon = m.level === 'High' ? '<i class="fas fa-exclamation-triangle risk-icon"></i>' : '';
        
        html += `
            <tr>
                <td><strong>${escapeHtml(m.name)}</strong></td>
                <td>${m.tasks}</td>
                <td>${m.hours}</td>
                <td><strong>${m.workloadScore}</strong>/100</td>
                <td><span class="workload-badge ${levelClass}">${m.level}</span></td>
                <td>${status} ${riskIcon}</td>
                <td><button class="edit-btn" onclick="openEditModal('${m.id}', '${escapeHtml(m.name)}', ${m.tasks}, ${m.hours})"><i class="fas fa-edit"></i> Edit</button></td>
            </tr>
        `;
    }
    tbody.innerHTML = html;
}

window.openEditModal = function(id, name, tasks, hours) {
    editMemberId = id;
    document.getElementById('editMemberName').value = name;
    document.getElementById('editTasks').value = tasks;
    document.getElementById('editHours').value = hours;
    document.getElementById('editModal').style.display = 'flex';
}

window.saveEdit = async function() {
    const newTasks = parseFloat(document.getElementById('editTasks').value);
    const newHours = parseFloat(document.getElementById('editHours').value);
    
    if (isNaN(newTasks) || isNaN(newHours)) {
        alert('Please enter valid numbers');
        return;
    }
    
    try {
        await apiCall(`/api/teams/${currentTeamId}/members/${editMemberId}`, 'PUT', { tasks: newTasks, hours: newHours });
        await loadTeamData();
        updateDashboardUI();
        closeModal();
        alert('Member updated successfully!');
    } catch (error) {
        alert('Error: ' + error.message);
    }
}

window.closeModal = function() {
    document.getElementById('editModal').style.display = 'none';
    editMemberId = null;
}

async function addMemberToTeam(name, tasks, hours) {
    const tasksNum = parseFloat(tasks);
    const hoursNum = parseFloat(hours);
    
    try {
        await apiCall(`/api/teams/${currentTeamId}/members`, 'POST', { name, tasks: tasksNum, hours: hoursNum });
        await loadTeamData();
        updateDashboardUI();
        return true;
    } catch (error) {
        alert('Error: ' + error.message);
        return false;
    }
}

function updateCharts() {
    const members = currentTeam.members_data || [];
    const low = members.filter(m => m.level === 'Low').length;
    const normal = members.filter(m => m.level === 'Normal').length;
    const high = members.filter(m => m.level === 'High').length;
    
    const ctxPie = document.getElementById('workloadPieChart').getContext('2d');
    if (pieChart) pieChart.destroy();
    pieChart = new Chart(ctxPie, {
        type: 'pie',
        data: {
            labels: ['Low Workload (<35)', 'Normal Workload (35-69)', 'High Workload (70-100)'],
            datasets: [{ data: [low, normal, high], backgroundColor: ['#4299e1', '#48bb78', '#f56565'] }]
        },
        options: { responsive: true, plugins: { legend: { position: 'bottom' } } }
    });
    
    const ctxBar = document.getElementById('workloadBarChart').getContext('2d');
    if (barChart) barChart.destroy();
    const names = members.map(m => m.name.length > 12 ? m.name.substring(0, 10) + '..' : m.name);
    const scores = members.map(m => m.workloadScore);
    const colors = scores.map(s => s >= 70 ? '#f56565' : (s >= 35 ? '#48bb78' : '#4299e1'));
    
    barChart = new Chart(ctxBar, {
        type: 'bar',
        data: { labels: names, datasets: [{ label: 'Workload Score', data: scores, backgroundColor: colors, borderRadius: 8 }] },
        options: { responsive: true, scales: { y: { beginAtZero: true, max: 100 } }, plugins: { legend: { display: false } } }
    });
}

function updateAlert() {
    const members = currentTeam.members_data || [];
    const overloaded = members.filter(m => m.level === 'High').length;
    const underutilized = members.filter(m => m.level === 'Low').length;
    
    let message = '';
    if (overloaded > 0 && underutilized > 0) {
        message = `⚠️ Team Imbalance: ${overloaded} overloaded, ${underutilized} underutilized.`;
    } else if (overloaded > 0) {
        message = `🔥 CRITICAL: ${overloaded} member(s) at burnout risk!`;
    } else if (underutilized > 0) {
        message = `📊 ${underutilized} member(s) have capacity for more work.`;
    } else if (members.length > 0) {
        message = `✅ Team workload is well balanced.`;
    } else {
        message = `👥 Add team members to start monitoring.`;
    }
    
    document.getElementById('imbalanceAlert').innerHTML = `<i class="fas fa-info-circle"></i> ${message}`;
}

window.goBack = function() {
    showTeamSelection();
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

// ============= EVENT LISTENERS =============
document.getElementById('memberForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = document.getElementById('memberName').value;
    const tasks = document.getElementById('tasksCompleted').value;
    const hours = document.getElementById('workHours').value;
    
    if (!name) { alert('Please enter member name'); return; }
    if (!tasks) { alert('Please enter tasks'); return; }
    if (!hours) { alert('Please enter hours'); return; }
    
    addMemberToTeam(name, tasks, hours);
    document.getElementById('memberName').value = '';
    document.getElementById('tasksCompleted').value = '';
    document.getElementById('workHours').value = '';
});

// ============= INITIALIZATION =============
const storedToken = localStorage.getItem('authToken');
const storedUser = localStorage.getItem('currentUser');

if (storedToken && storedUser) {
    authToken = storedToken;
    currentUser = JSON.parse(storedUser);
    showTeamSelection();
} else {
    document.getElementById('authScreen').style.display = 'flex';
}