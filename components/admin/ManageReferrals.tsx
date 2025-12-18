import React, { useState, useEffect } from 'react';
import { User, ReferralSettings } from '../../types';
import { db } from '../../firebaseConfig';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface ManageReferralsProps {
    users: User[];
}

const ManageReferrals: React.FC<ManageReferralsProps> = ({ users }) => {
    const [activeTab, setActiveTab] = useState<'dashboard' | 'configuration' | 'leaderboard'>('dashboard');
    const [settings, setSettings] = useState<ReferralSettings>({
        inviterBonus: 200,
        inviteeBonus: 300,
        badgeThreshold: 5,
        isActive: true
    });
    const [saving, setSaving] = useState(false);

    // Fetch Real-time Settings
    useEffect(() => {
        if (!db) return;
        const unsub = onSnapshot(doc(db, 'settings', 'referrals'), (snap) => {
            if (snap.exists()) {
                setSettings(snap.data() as ReferralSettings);
            }
        }, (e: any) => {
            console.error("Referral settings listen failed: " + (e?.message || String(e)));
        });
        return () => unsub();
    }, []);

    // --- ANALYTICS CALCULATIONS ---
    const totalInvites = users.reduce((acc, user) => acc + (user.referralStats?.totalInvited || 0), 0);
    const totalPayouts = users.reduce((acc, user) => acc + (user.referralStats?.totalEarned || 0), 0);
    const activeReferrers = users.filter(u => (u.referralStats?.totalInvited || 0) > 0).length;
    
    // Top 5 Referrers for Chart
    const topReferrers = [...users]
        .filter(u => !u.isAdmin) // Exclude admin
        .sort((a, b) => (b.referralStats?.totalInvited || 0) - (a.referralStats?.totalInvited || 0))
        .slice(0, 5)
        .map(u => ({
            name: u.name.split(' ')[0], // First name only for chart
            invites: u.referralStats?.totalInvited || 0
        }));

    // --- ACTIONS ---
    const handleSaveSettings = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        try {
            if (db) {
                await setDoc(doc(db, 'settings', 'referrals'), settings, { merge: true });
                alert("✅ Referral Configuration Updated Successfully!");
            } else {
                 alert("⚠️ Settings saved locally (Demo Mode).");
            }
        } catch (e: any) {
            console.error("Save error:", e.message || String(e));
            alert("Error saving settings (Check permissions or Demo Mode)");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="animate-fade-in min-h-screen">
            {/* HEADER */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
                <div>
                    <h2 className="text-3xl font-bold text-gray-800 dark:text-white flex items-center gap-2">
                        🤝 Referral System Master
                    </h2>
                    <p className="text-gray-500 text-sm">Monitor growth, configure rewards, and identify top influencers.</p>
                </div>

                {/* TABS */}
                <div className="flex bg-white dark:bg-dark-surface p-1.5 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
                    {[
                        { id: 'dashboard', label: 'Analytics Hub', icon: '📊' },
                        { id: 'configuration', label: 'Control Panel', icon: '⚙️' },
                        { id: 'leaderboard', label: 'Network & Users', icon: '🏆' },
                    ].map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id as any)}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                                activeTab === tab.id 
                                ? 'bg-primary text-white shadow-md' 
                                : 'text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                            }`}
                        >
                            <span>{tab.icon}</span> {tab.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* TAB 1: DASHBOARD */}
            {activeTab === 'dashboard' && (
                <div className="space-y-6">
                    {/* Key Metrics */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div className="bg-gradient-to-br from-blue-600 to-blue-700 p-6 rounded-xl text-white shadow-lg">
                            <p className="text-blue-100 text-xs uppercase font-bold tracking-wider">Total Invites</p>
                            <h3 className="text-3xl font-bold mt-1">{totalInvites}</h3>
                            <p className="text-xs opacity-80 mt-2">New users acquired</p>
                        </div>
                        <div className="bg-white dark:bg-dark-surface p-6 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
                            <p className="text-gray-500 text-xs uppercase font-bold tracking-wider">Total Credits Distributed</p>
                            <h3 className="text-2xl font-bold text-green-600">Rs. {totalPayouts.toLocaleString()}</h3>
                            <p className="text-xs text-gray-400 mt-1">Virtual Ad Credit</p>
                        </div>
                        <div className="bg-white dark:bg-dark-surface p-6 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
                            <p className="text-gray-500 text-xs uppercase font-bold tracking-wider">Active Referrers</p>
                            <h3 className="text-2xl font-bold text-purple-600">{activeReferrers}</h3>
                            <p className="text-xs text-gray-400 mt-1">Users who invited at least 1 person</p>
                        </div>
                        <div className="bg-white dark:bg-dark-surface p-6 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
                            <p className="text-gray-500 text-xs uppercase font-bold tracking-wider">System Status</p>
                            <h3 className={`text-2xl font-bold ${settings.isActive ? 'text-green-600' : 'text-red-600'}`}>
                                {settings.isActive ? 'ACTIVE' : 'PAUSED'}
                            </h3>
                            <p className="text-xs text-gray-400 mt-1">Global Referral System</p>
                        </div>
                    </div>

                    {/* Charts Row */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="bg-white dark:bg-dark-surface p-6 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
                            <h3 className="font-bold text-gray-800 dark:text-white mb-6">Top 5 Influencers</h3>
                            <div className="h-64 w-full">
                                <ResponsiveContainer>
                                    <BarChart data={topReferrers} layout="vertical" margin={{ left: 20 }}>
                                        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                                        <XAxis type="number" />
                                        <YAxis dataKey="name" type="category" width={80} />
                                        <Tooltip />
                                        <Bar dataKey="invites" fill="#002f34" radius={[0, 4, 4, 0]} barSize={20} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        <div className="bg-white dark:bg-dark-surface p-6 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm flex flex-col justify-center items-center text-center">
                            <div className="mb-4">
                                <span className="text-5xl">🚀</span>
                            </div>
                            <h3 className="font-bold text-xl text-gray-800 dark:text-white">Growth Engine</h3>
                            <p className="text-gray-500 mt-2 max-w-sm">
                                Your zero-budget referral strategy is currently generating traffic. 
                                Consider increasing the "Inviter Bonus" during holidays to spike growth.
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* TAB 2: CONFIGURATION */}
            {activeTab === 'configuration' && (
                <div className="max-w-3xl mx-auto">
                    <div className="bg-white dark:bg-dark-surface rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                        <div className="p-6 bg-gradient-to-r from-purple-600 to-indigo-600 text-white flex justify-between items-center">
                            <div>
                                <h3 className="text-xl font-bold">Referral Logic Controller</h3>
                                <p className="text-purple-100 text-sm">Adjust rewards instantly without app updates.</p>
                            </div>
                            <div className="text-4xl opacity-20">⚙️</div>
                        </div>

                        <form onSubmit={handleSaveSettings} className="p-8 space-y-8">
                            
                            {/* Master Switch */}
                            <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-600">
                                <div>
                                    <h4 className="font-bold text-gray-900 dark:text-white">Master System Switch</h4>
                                    <p className="text-xs text-gray-500">Turning this off prevents new users from claiming bonuses.</p>
                                </div>
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input 
                                        type="checkbox" 
                                        className="sr-only peer"
                                        checked={settings.isActive}
                                        onChange={() => setSettings(prev => ({ ...prev, isActive: !prev.isActive }))} 
                                    />
                                    <div className="w-14 h-7 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-purple-300 dark:peer-focus:ring-purple-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[4px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all dark:border-gray-600 peer-checked:bg-purple-600"></div>
                                </label>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                {/* Inviter Config */}
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">
                                        Inviter Reward (Ad Credit)
                                    </label>
                                    <div className="relative">
                                        <span className="absolute left-3 top-3 text-gray-500 font-bold">Rs.</span>
                                        <input 
                                            type="number"
                                            value={settings.inviterBonus}
                                            onChange={(e) => setSettings(prev => ({...prev, inviterBonus: Number(e.target.value)}))}
                                            className="w-full pl-10 pr-4 py-3 border-2 border-gray-200 dark:border-gray-600 rounded-xl focus:border-purple-500 outline-none dark:bg-gray-800 dark:text-white transition-all font-bold text-lg"
                                        />
                                    </div>
                                    <p className="text-xs text-gray-500 mt-2">
                                        Amount credited to the person sharing their code.
                                    </p>
                                </div>

                                {/* Invitee Config */}
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">
                                        Invitee Reward (Welcome)
                                    </label>
                                    <div className="relative">
                                        <span className="absolute left-3 top-3 text-gray-500 font-bold">Rs.</span>
                                        <input 
                                            type="number"
                                            value={settings.inviteeBonus}
                                            onChange={(e) => setSettings(prev => ({...prev, inviteeBonus: Number(e.target.value)}))}
                                            className="w-full pl-10 pr-4 py-3 border-2 border-gray-200 dark:border-gray-600 rounded-xl focus:border-purple-500 outline-none dark:bg-gray-800 dark:text-white transition-all font-bold text-lg"
                                        />
                                    </div>
                                    <p className="text-xs text-gray-500 mt-2">
                                        Welcome bonus for the new user joining.
                                    </p>
                                </div>
                            </div>

                            {/* Badge Config */}
                            <div className="p-4 bg-yellow-50 dark:bg-yellow-900/10 rounded-xl border border-yellow-200 dark:border-yellow-900/30">
                                <h4 className="font-bold text-yellow-800 dark:text-yellow-500 mb-4 flex items-center gap-2">
                                    <span>🌟</span> Gamification: Star Seller Badge
                                </h4>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                        Invites Required to Unlock
                                    </label>
                                    <input 
                                        type="number"
                                        value={settings.badgeThreshold}
                                        onChange={(e) => setSettings(prev => ({...prev, badgeThreshold: Number(e.target.value)}))}
                                        className="w-full px-4 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                                    />
                                    <p className="text-xs text-gray-500 mt-2">
                                        Users who reach this number of invites will get a "Community Star" badge on their profile.
                                    </p>
                                </div>
                            </div>

                            <div className="pt-4 flex justify-end">
                                <button 
                                    type="submit" 
                                    disabled={saving}
                                    className="px-8 py-3 bg-primary text-white font-bold rounded-xl shadow-lg hover:bg-primary-dark transition-all flex items-center gap-2 transform active:scale-95"
                                >
                                    {saving ? 'Saving Changes...' : 'Update System Configuration'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* TAB 3: LEADERBOARD & USERS */}
            {activeTab === 'leaderboard' && (
                <div className="bg-white dark:bg-dark-surface rounded-xl shadow-md overflow-hidden border border-gray-200 dark:border-gray-700">
                    <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-800">
                        <h3 className="font-bold text-gray-800 dark:text-white">Referral Network</h3>
                        <div className="text-sm text-gray-500">Sorted by Impact (Highest Invites)</div>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                            <thead className="bg-gray-100 dark:bg-gray-900">
                                <tr>
                                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase">Rank</th>
                                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase">User</th>
                                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase">Referral Code</th>
                                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase">Invites</th>
                                    <th className="px-6 py-4 text-right text-xs font-bold text-gray-500 uppercase">Earned Credit</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                {[...users]
                                    .filter(u => !u.isAdmin)
                                    .sort((a, b) => (b.referralStats?.totalInvited || 0) - (a.referralStats?.totalInvited || 0))
                                    .map((user, idx) => (
                                    <tr key={user.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                                        <td className="px-6 py-4 text-gray-500 font-mono text-xs">#{idx + 1}</td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center">
                                                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold mr-3 text-xs">
                                                    {user.name.charAt(0)}
                                                </div>
                                                <div>
                                                    <div className="font-bold text-sm text-gray-900 dark:text-white">{user.name}</div>
                                                    <div className="text-xs text-gray-500">{user.email}</div>
                                                </div>
                                                {(user.referralStats?.totalInvited || 0) >= settings.badgeThreshold && (
                                                    <span className="ml-2 text-lg" title="Star Seller">🌟</span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-xs font-mono text-gray-600 dark:text-gray-300">
                                                {user.referralCode}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                                                (user.referralStats?.totalInvited || 0) > 0 ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'
                                            }`}>
                                                {user.referralStats?.totalInvited || 0} Users
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-right font-bold text-green-600">
                                            Rs. {(user.referralStats?.totalEarned || 0).toLocaleString()}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ManageReferrals;
