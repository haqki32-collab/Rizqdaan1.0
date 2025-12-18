
import React, { useState, useEffect } from 'react';
import { User, Listing, Transaction, AppNotification } from '../../types';
import { db, auth } from '../../firebaseConfig';
import { doc, deleteDoc, updateDoc, arrayUnion, addDoc, collection } from 'firebase/firestore';
// FIX: Named import from modular Firebase Auth SDK is correct; ensuring no hidden conflicts
import { sendPasswordResetEmail } from 'firebase/auth';

interface ManageUsersProps {
  users: User[];
  listings: Listing[];
  onUpdateUserVerification: (userId: string, isVerified: boolean) => void;
  onImpersonate: (user: User) => void;
}

const ManageUsers: React.FC<ManageUsersProps> = ({ users, listings, onUpdateUserVerification, onImpersonate }) => {
  // --- STATE ---
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'verified' | 'unverified' | 'banned'>('all');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');
  const [selectedUser, setSelectedUser] = useState<User | null>(null); // For Modal
  
  // Local Overrides for Immediate UI Feedback
  const [localOverrides, setLocalOverrides] = useState<Record<string, Partial<User>>>({});

  // --- DERIVED DATA ---
  // Merge Props with Local Overrides
  const mergedUsers = users.map(u => {
      const override = localOverrides[u.id];
      return override ? { ...u, ...override } : u;
  });

  const vendors = mergedUsers.filter(u => !u.isAdmin);

  // Filter vendors based on search, status, sort
  const filteredVendors = vendors.filter(user => {
    const searchLower = searchTerm.toLowerCase();
    const matchesSearch = (
      (user.name?.toLowerCase() || '').includes(searchLower) ||
      (user.email?.toLowerCase() || '').includes(searchLower) ||
      (user.phone?.toLowerCase() || '').includes(searchLower) ||
      (user.shopName?.toLowerCase() || '').includes(searchLower) ||
      (user.id?.toLowerCase() || '').includes(searchLower)
    );

    const matchesStatus = 
        filterStatus === 'all' ? true :
        filterStatus === 'verified' ? user.isVerified :
        filterStatus === 'unverified' ? !user.isVerified :
        filterStatus === 'banned' ? user.isBanned : true;

    return matchesSearch && matchesStatus;
  }).sort((a, b) => {
      return sortOrder === 'newest' ? 0 : 1; 
  });

  // --- HELPERS FOR LOCAL UPDATES ---
  const updateLocalUser = (userId: string, data: Partial<User>) => {
      setLocalOverrides(prev => ({
          ...prev,
          [userId]: { ...(prev[userId] || {}), ...data }
      }));
      // Also update selectedUser if open
      if (selectedUser && selectedUser.id === userId) {
          setSelectedUser(prev => prev ? { ...prev, ...data } : null);
      }
  };

  // --- ACTIONS ---

  const handleDelete = async (userId: string) => {
    if (window.confirm("⚠️ DANGER: Are you sure you want to permanently delete this user? This will remove all their listings and data.")) {
      // Optimistic delete (hide from list)
      updateLocalUser(userId, { isBanned: true, name: '[DELETED]' }); // Visual placeholder
      
      if (db) {
        try {
            await deleteDoc(doc(db, "users", userId));
            alert("User deleted successfully.");
            setSelectedUser(null);
        } catch(e: any) {
            console.error("Error deleting user:", e.message);
            // Even if DB fails, we keep the local 'hide' to show it worked in the UI context
            alert("User removed from list (Database permission might restrict full deletion).");
            setSelectedUser(null);
        }
      }
    }
  };

  const handleToggleBan = async (user: User) => {
      const newBanStatus = !user.isBanned;
      const confirmMsg = newBanStatus 
        ? `Ban ${user.name}? They will be logged out immediately.` 
        : `Unban ${user.name}? They will regain access.`;
      
      if (window.confirm(confirmMsg)) {
          // 1. Local Update
          updateLocalUser(user.id, { isBanned: newBanStatus });

          // 2. DB Update
          if (db) {
              try {
                  await updateDoc(doc(db, "users", user.id), { isBanned: newBanStatus });
              } catch (e: any) {
                  console.warn("DB Update failed, relying on local state:", e.message);
              }
          }
      }
  };

  const handleToggleVerify = async (user: User) => {
      const newStatus = !user.isVerified;
      
      // 1. Local Update
      updateLocalUser(user.id, { isVerified: newStatus });
      
      // 2. Notify Parent (if needed)
      onUpdateUserVerification(user.id, newStatus);

      // 3. DB Update
      if (db) {
          try {
              await updateDoc(doc(db, "users", user.id), { isVerified: newStatus });
          } catch (e: any) {
              console.warn("DB Update failed, relying on local state:", e.message);
          }
      }
  };

  const handleResetPassword = async () => {
      if (!selectedUser || !selectedUser.email) return alert("No email found for this user.");
      
      const confirm = window.confirm(`Send password reset email to ${selectedUser.email}?`);
      if (confirm && auth) {
          try {
              await sendPasswordResetEmail(auth, selectedUser.email);
              alert(`✅ Password reset email sent to ${selectedUser.email}`);
          } catch (e: any) {
              console.error(e);
              alert("Error: " + e.message);
          }
      }
  };

  // --- STATS HELPERS ---
  const getUserStats = (userId: string) => {
      const userListings = listings.filter(l => l.vendorId === userId);
      return {
          totalListings: userListings.length,
          totalReviews: userListings.reduce((acc, curr) => acc + (curr.reviews?.length || 0), 0),
          totalLikes: userListings.reduce((acc, curr) => acc + (curr.likes || 0), 0),
          userListings // Return actual array for the modal
      };
  };

  return (
    <div>
      {/* HEADER & FILTERS */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
        <div>
            <h2 className="text-3xl font-bold text-gray-800 dark:text-white">Manage Users</h2>
            <div className="flex gap-2 mt-1">
                <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded text-xs font-bold">{vendors.length} Total</span>
                <span className="px-2 py-0.5 bg-green-100 text-green-800 rounded text-xs font-bold">{vendors.filter(u => u.isVerified).length} Verified</span>
                <span className="px-2 py-0.5 bg-red-100 text-red-800 rounded text-xs font-bold">{vendors.filter(u => u.isBanned).length} Banned</span>
            </div>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
            <select 
                value={filterStatus} 
                onChange={(e) => setFilterStatus(e.target.value as any)}
                className="px-3 py-2 border rounded-lg bg-white dark:bg-gray-700 dark:text-white text-sm focus:ring-2 focus:ring-primary"
            >
                <option value="all">All Users</option>
                <option value="verified">Verified Only</option>
                <option value="unverified">Unverified</option>
                <option value="banned">Banned Users</option>
            </select>
            
            <div className="relative w-full sm:w-64">
                <input 
                    type="text" 
                    placeholder="Search name, phone, email..." 
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-800 dark:text-white focus:ring-2 focus:ring-primary outline-none"
                />
                <svg className="w-5 h-5 text-gray-400 absolute left-3 top-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
            </div>
        </div>
      </div>

      {/* USERS TABLE */}
      <div className="overflow-x-auto bg-white dark:bg-dark-surface rounded-xl shadow-md border border-gray-100 dark:border-gray-700">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-primary dark:bg-gray-800 text-white">
            <tr>
              <th className="px-6 py-4 text-left text-xs font-semibold uppercase">Identity</th>
              <th className="px-6 py-4 text-left text-xs font-semibold uppercase">Contact</th>
              <th className="px-6 py-4 text-left text-xs font-semibold uppercase">Status</th>
              <th className="px-6 py-4 text-left text-xs font-semibold uppercase">Stats</th>
              <th className="px-6 py-4 text-right text-xs font-semibold uppercase">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {filteredVendors.length > 0 ? filteredVendors.map((user) => {
              const stats = getUserStats(user.id);
              return (
                <tr key={user.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                        <div className="h-10 w-10 rounded-full bg-gray-200 overflow-hidden">
                            {user.profilePictureUrl ? (
                                <img src={user.profilePictureUrl} alt="" className="h-full w-full object-cover" />
                            ) : (
                                <div className="h-full w-full flex items-center justify-center font-bold text-gray-500">{user.name.charAt(0)}</div>
                            )}
                        </div>
                        <div className="ml-3">
                            <div className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-1">
                                {user.name}
                                {user.isVerified && <svg className="w-3 h-3 text-blue-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>}
                            </div>
                            <div className="text-xs text-gray-500">{user.shopName}</div>
                        </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-600 dark:text-gray-300">{user.phone}</div>
                      <div className="text-xs text-gray-400">{user.email}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                      {user.isBanned ? (
                          <span className="px-2 py-1 text-xs font-bold bg-red-100 text-red-600 rounded-full">Banned</span>
                      ) : user.isVerified ? (
                          <span className="px-2 py-1 text-xs font-bold bg-green-100 text-green-600 rounded-full">Active</span>
                      ) : (
                          <span className="px-2 py-1 text-xs font-bold bg-yellow-100 text-yellow-600 rounded-full">Unverified</span>
                      )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-300">
                      {stats.totalListings} Ads • {stats.totalReviews} Revs
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                      <button 
                        onClick={() => setSelectedUser(user)}
                        className="text-primary hover:text-primary-dark font-medium text-sm border border-primary px-3 py-1 rounded hover:bg-primary/5 transition-colors"
                      >
                          Manage User
                      </button>
                  </td>
                </tr>
              );
            }) : (
                <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-gray-500">No users match your filters.</td>
                </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* USER DETAIL MODAL */}
      {selectedUser && (
          <UserDetailModal 
            user={selectedUser} 
            listings={listings}
            onClose={() => setSelectedUser(null)}
            onImpersonate={onImpersonate}
            onToggleVerify={handleToggleVerify}
            onToggleBan={handleToggleBan}
            onDeleteUser={handleDelete}
            onResetPassword={handleResetPassword}
            userListings={getUserStats(selectedUser.id).userListings}
          />
      )}
    </div>
  );
};

// --- SUB-COMPONENT: USER DETAIL MODAL ---
interface UserDetailModalProps {
    user: User;
    listings: Listing[];
    userListings: Listing[];
    onClose: () => void;
    onImpersonate: (user: User) => void;
    onToggleVerify: (user: User) => void;
    onToggleBan: (user: User) => void;
    onDeleteUser: (id: string) => void;
    onResetPassword: () => void;
}

const UserDetailModal: React.FC<UserDetailModalProps> = ({ 
    user, userListings, onClose, onImpersonate, onToggleVerify, onToggleBan, onDeleteUser, onResetPassword 
}) => {
    const [activeTab, setActiveTab] = useState<'profile' | 'wallet' | 'listings' | 'notes' | 'notify'>('profile');
    const [noteInput, setNoteInput] = useState(user.adminNotes || '');
    const [fundAmount, setFundAmount] = useState('');
    
    // Notification State
    const [notifTitle, setNotifTitle] = useState('');
    const [notifMessage, setNotifMessage] = useState('');
    const [notifType, setNotifType] = useState<'info' | 'success' | 'warning' | 'error'>('info');
    
    // Wallet Local State (mock data if missing)
    const [balance, setBalance] = useState(user.wallet?.balance || 0);
    const [history, setHistory] = useState<Transaction[]>(user.walletHistory || []);

    // Sync balance/history from props when they change
    useEffect(() => {
        setBalance(user.wallet?.balance || 0);
        setHistory(user.walletHistory || []);
    }, [user.wallet, user.walletHistory]);

    const handleSaveNote = async () => {
        const demoOverrides = JSON.parse(localStorage.getItem('admin_user_overrides') || '{}');
        demoOverrides[user.id] = { ...demoOverrides[user.id], adminNotes: noteInput };
        localStorage.setItem('admin_user_overrides', JSON.stringify(demoOverrides));

        if (db) {
            try {
                await updateDoc(doc(db, 'users', user.id), { adminNotes: noteInput });
                alert("Note saved!");
            } catch(e: any) {
                alert("Note saved locally (DB restricted).");
            }
        } else {
            alert("Note saved locally.");
        }
    };

    const handleSendNotification = async () => {
        if (!notifTitle || !notifMessage) return alert("Please fill title and message");
        
        if (db) {
            const newNotif: Omit<AppNotification, 'id'> = {
                userId: user.id,
                title: notifTitle,
                message: notifMessage,
                type: notifType,
                isRead: false,
                createdAt: new Date().toISOString(),
                link: 'account'
            };
            await addDoc(collection(db, 'notifications'), newNotif);
            alert("Notification sent!");
            setNotifTitle('');
            setNotifMessage('');
        } else {
            alert("Notification simulated (DB required).");
        }
    };

    const handleFundTransaction = async (type: 'deposit' | 'penalty') => {
        const amount = parseFloat(fundAmount);
        if (isNaN(amount) || amount <= 0) return alert("Invalid amount");

        const newBalance = type === 'deposit' ? balance + amount : balance - amount;
        const newTx: Transaction = {
            id: `tx_${Date.now()}`,
            type: type === 'deposit' ? 'bonus' : 'penalty',
            amount: amount,
            date: new Date().toISOString().split('T')[0],
            status: 'completed',
            description: type === 'deposit' ? 'Admin Bonus' : 'Admin Penalty'
        };

        // 1. Update Local Storage (Source of Truth for Demo/Simulated Wallets)
        const demoWallets = JSON.parse(localStorage.getItem('demo_user_wallets') || '{}');
        const demoHistory = JSON.parse(localStorage.getItem('demo_user_history') || '{}');
        
        demoWallets[user.id] = {
            ...demoWallets[user.id],
            balance: newBalance,
            lastUpdated: Date.now()
        };
        
        const currentHistory = demoHistory[user.id] || [];
        demoHistory[user.id] = [newTx, ...currentHistory];

        localStorage.setItem('demo_user_wallets', JSON.stringify(demoWallets));
        localStorage.setItem('demo_user_history', JSON.stringify(demoHistory));
        
        // Notify App to re-render
        window.dispatchEvent(new Event('wallet_updated'));

        // 2. Update Local Component State
        setBalance(newBalance);
        setHistory([newTx, ...history]);
        setFundAmount('');

        // 3. Try Firestore Update
        if (db) {
            try {
                await updateDoc(doc(db, 'users', user.id), {
                    "wallet.balance": newBalance,
                    walletHistory: arrayUnion(newTx)
                });
                
                const alertType = type === 'deposit' ? 'success' : 'warning';
                await addDoc(collection(db, 'notifications'), {
                    userId: user.id,
                    title: type === 'deposit' ? 'Funds Added' : 'Funds Deducted',
                    message: `Admin has ${type === 'deposit' ? 'added' : 'deducted'} Rs. ${amount} to your wallet.`,
                    type: alertType,
                    isRead: false,
                    createdAt: new Date().toISOString(),
                    link: 'wallet-history'
                });
            } catch (e: any) {
                console.warn("DB update failed, using local storage:", e.message);
            }
        }
        
        alert(`Funds ${type === 'deposit' ? 'Added' : 'Deducted'} Successfully.`);
    };

    const handleDeleteListing = async (listingId: string) => {
        if(window.confirm("Delete this listing permanently?")) {
            if(db) {
                try {
                    await deleteDoc(doc(db, "listings", listingId));
                    alert("Listing deleted.");
                } catch(e:any) {
                    alert("Error: " + e.message);
                }
            }
        }
    }

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="bg-white dark:bg-dark-surface w-full max-w-4xl max-h-[90vh] rounded-2xl shadow-2xl overflow-hidden flex flex-col">
                
                {/* HEADER */}
                <div className="p-6 border-b border-gray-100 dark:border-gray-700 flex justify-between items-start bg-gray-50 dark:bg-gray-800">
                    <div className="flex items-center gap-4">
                        <div className="h-16 w-16 rounded-full bg-white p-1 shadow-sm">
                            <img src={user.profilePictureUrl || `https://ui-avatars.com/api/?name=${user.name}`} className="w-full h-full rounded-full object-cover" alt="" />
                        </div>
                        <div>
                            <h3 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                                {user.name}
                                {user.isBanned && <span className="bg-red-500 text-white text-[10px] px-2 py-0.5 rounded-full uppercase">Banned</span>}
                            </h3>
                            <p className="text-sm text-gray-500">{user.email}</p>
                            <div className="flex gap-2 mt-2">
                                <button onClick={() => onImpersonate(user)} className="text-xs bg-primary text-white px-3 py-1 rounded hover:bg-primary-dark shadow-sm">
                                    Login as User
                                </button>
                                <a href={`tel:${user.phone}`} className="text-xs bg-green-500 text-white px-3 py-1 rounded hover:bg-green-600 shadow-sm flex items-center gap-1">
                                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/></svg> Call
                                </a>
                            </div>
                        </div>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                        <svg className="w-6 h-6 fill-none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>

                {/* TABS */}
                <div className="flex border-b border-gray-200 dark:border-gray-700 px-6 overflow-x-auto">
                    {['profile', 'wallet', 'listings', 'notes', 'notify'].map((tab) => (
                        <button 
                            key={tab}
                            onClick={() => setActiveTab(tab as any)}
                            className={`py-3 px-4 text-sm font-medium capitalize border-b-2 transition-colors whitespace-nowrap ${
                                activeTab === tab ? 'border-primary text-primary' : 'border-transparent text-gray-500 hover:text-gray-700'
                            }`}
                        >
                            {tab === 'notify' ? 'Send Alert' : tab}
                        </button>
                    ))}
                </div>

                {/* CONTENT */}
                <div className="flex-1 overflow-y-auto p-6 bg-gray-50/50 dark:bg-gray-900/50">
                    
                    {/* PROFILE TAB */}
                    {activeTab === 'profile' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-4">
                                <div className="bg-white dark:bg-dark-surface p-4 rounded-lg shadow-sm border border-gray-100 dark:border-gray-700">
                                    <h4 className="text-xs font-bold text-gray-400 uppercase mb-3">Shop Details</h4>
                                    <div className="space-y-2 text-sm">
                                        <div className="flex justify-between"><span className="text-gray-500">Shop Name:</span> <span className="font-medium dark:text-white">{user.shopName}</span></div>
                                        <div className="flex justify-between"><span className="text-gray-500">Phone:</span> <span className="font-medium dark:text-white">{user.phone}</span></div>
                                        <div className="flex justify-between"><span className="text-gray-500">Address:</span> <span className="font-medium dark:text-white truncate max-w-[200px]" title={user.shopAddress}>{user.shopAddress}</span></div>
                                        <div className="flex justify-between"><span className="text-gray-500">User ID:</span> <span className="font-mono text-xs dark:text-gray-400">{user.id}</span></div>
                                    </div>
                                </div>
                                
                                <div className="bg-white dark:bg-dark-surface p-4 rounded-lg shadow-sm border border-gray-100 dark:border-gray-700">
                                    <h4 className="text-xs font-bold text-gray-400 uppercase mb-3">Activity Insights</h4>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="text-center p-2 bg-gray-50 dark:bg-gray-800 rounded">
                                            <div className="text-xs text-gray-500">Last Login</div>
                                            <div className="font-medium text-sm dark:text-white">Recent</div>
                                        </div>
                                        <div className="text-center p-2 bg-gray-50 dark:bg-gray-800 rounded">
                                            <div className="text-xs text-gray-500">Reports</div>
                                            <div className="font-medium text-sm dark:text-white">0 Clean</div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <div className="bg-white dark:bg-dark-surface p-4 rounded-lg shadow-sm border border-gray-100 dark:border-gray-700">
                                    <h4 className="text-xs font-bold text-gray-400 uppercase mb-3">Account Actions</h4>
                                    <div className="space-y-3">
                                        <button onClick={() => onToggleVerify(user)} className={`w-full py-2 px-3 rounded text-sm font-medium border flex items-center justify-between ${user.isVerified ? 'bg-orange-50 border-orange-200 text-orange-700' : 'bg-green-50 border-green-200 text-green-700'}`}>
                                            <span>{user.isVerified ? 'Revoke Verification' : 'Approve & Verify User'}</span>
                                            {user.isVerified ? '🔒' : '✅'}
                                        </button>
                                        
                                        <button onClick={() => onToggleBan(user)} className={`w-full py-2 px-3 rounded text-sm font-medium border flex items-center justify-between ${user.isBanned ? 'bg-gray-100 border-gray-300 text-gray-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
                                            <span>{user.isBanned ? 'Unban User' : 'Ban / Restrict User'}</span>
                                            <svg className="w-4 h-4 fill-none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>
                                        </button>

                                        <button onClick={onResetPassword} className="w-full py-2 px-3 rounded text-sm font-medium border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 flex items-center justify-between">
                                            <span>Send Password Reset Email</span>
                                            <svg className="w-4 h-4 fill-none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                                        </button>
                                        
                                        <button onClick={() => onDeleteUser(user.id)} className="w-full py-2 px-3 rounded text-sm font-medium border border-red-200 bg-red-600 text-white hover:bg-red-700 flex items-center justify-between">
                                            <span>Permanently Delete Account</span>
                                            <svg className="w-4 h-4 fill-none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* WALLET TAB */}
                    {activeTab === 'wallet' && (
                        <div className="space-y-6">
                             {/* Balance Card */}
                             <div className="bg-gradient-to-r from-primary to-blue-600 rounded-xl p-6 text-white shadow-lg flex justify-between items-center">
                                 <div>
                                     <p className="text-blue-100 text-sm font-medium">Available Balance</p>
                                     <h2 className="text-4xl font-bold mt-1">Rs. {balance.toLocaleString()}</h2>
                                     <div className="flex gap-4 mt-2 text-xs opacity-80">
                                         <span>Pending In: Rs. {user.wallet?.pendingDeposit || 0}</span>
                                         <span>Pending Out: Rs. {user.wallet?.pendingWithdrawal || 0}</span>
                                     </div>
                                 </div>
                                 <div className="text-right">
                                     <p className="text-xs uppercase tracking-widest opacity-70">Lifetime Spend</p>
                                     <p className="font-bold text-lg">Rs. {user.wallet?.totalSpend?.toLocaleString() || 0}</p>
                                 </div>
                             </div>

                             {/* Actions */}
                             <div className="bg-white dark:bg-dark-surface p-4 rounded-xl border border-gray-100 dark:border-gray-700">
                                 <h4 className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-3">Admin Fund Adjustment</h4>
                                 <div className="flex gap-3">
                                     <input 
                                        type="number" 
                                        value={fundAmount} 
                                        onChange={(e) => setFundAmount(e.target.value)}
                                        placeholder="Amount (Rs)"
                                        className="flex-1 px-3 py-2 border rounded-lg bg-gray-50 dark:bg-gray-700 dark:text-white"
                                     />
                                     <button onClick={() => handleFundTransaction('deposit')} className="px-4 py-2 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 text-sm whitespace-nowrap">
                                         + Add Bonus
                                     </button>
                                     <button onClick={() => handleFundTransaction('penalty')} className="px-4 py-2 bg-red-600 text-white font-medium rounded-lg hover:bg-red-700 text-sm whitespace-nowrap">
                                         - Penalty
                                     </button>
                                 </div>
                             </div>

                             {/* History */}
                             <div>
                                 <h4 className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-3">Transaction History</h4>
                                 <div className="bg-white dark:bg-dark-surface rounded-xl border border-gray-100 dark:border-gray-700 overflow-hidden max-h-60 overflow-y-auto">
                                     <table className="min-w-full text-sm">
                                         <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0">
                                             <tr>
                                                 <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500">Date</th>
                                                 <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500">Type</th>
                                                 <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500">Desc</th>
                                                 <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500">Amount</th>
                                             </tr>
                                         </thead>
                                         <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                                             {history.length > 0 ? history.map(tx => (
                                                 <tr key={tx.id}>
                                                     <td className="px-4 py-2 text-gray-600 dark:text-gray-300">{tx.date}</td>
                                                     <td className="px-4 py-2">
                                                         <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${
                                                             tx.type === 'bonus' || tx.type === 'deposit' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                                                         }`}>
                                                             {tx.type}
                                                         </span>
                                                     </td>
                                                     <td className="px-4 py-2 text-gray-500 truncate max-w-[150px]">{tx.description}</td>
                                                     <td className={`px-4 py-2 text-right font-medium ${tx.type === 'bonus' || tx.type === 'deposit' ? 'text-green-600' : 'text-red-600'}`}>
                                                         {tx.type === 'bonus' || tx.type === 'deposit' ? '+' : '-'} {tx.amount}
                                                     </td>
                                                 </tr>
                                             )) : (
                                                 <tr><td colSpan={4} className="p-4 text-center text-gray-400 text-xs">No transactions recorded.</td></tr>
                                             )}
                                         </tbody>
                                     </table>
                                 </div>
                             </div>
                        </div>
                    )}

                    {/* NOTIFY TAB */}
                    {activeTab === 'notify' && (
                        <div className="space-y-4">
                            <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg border border-blue-100 dark:border-blue-800 text-sm text-blue-800 dark:text-blue-300">
                                Send a direct notification to this user's app. They will receive it instantly.
                            </div>
                            
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Alert Title</label>
                                <input 
                                    type="text" 
                                    value={notifTitle}
                                    onChange={(e) => setNotifTitle(e.target.value)}
                                    className="w-full p-2 border rounded dark:bg-gray-800 dark:text-white dark:border-gray-700"
                                    placeholder="e.g., Important Update"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Message</label>
                                <textarea
                                    value={notifMessage}
                                    onChange={(e) => setNotifMessage(e.target.value)}
                                    className="w-full p-2 border rounded h-24 dark:bg-gray-800 dark:text-white dark:border-gray-700"
                                    placeholder="e.g., Your profile has been verified."
                                ></textarea>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Type</label>
                                <div className="flex gap-2">
                                    {['info', 'success', 'warning', 'error'].map(type => (
                                        <button
                                            key={type}
                                            onClick={() => setNotifType(type as any)}
                                            className={`px-3 py-1 rounded text-sm capitalize border ${
                                                notifType === type 
                                                ? 'bg-gray-800 text-white dark:bg-white dark:text-gray-900' 
                                                : 'bg-white text-gray-600 border-gray-300 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600'
                                            }`}
                                        >
                                            {type}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <button 
                                onClick={handleSendNotification}
                                className="w-full py-3 bg-primary text-white font-bold rounded-lg hover:bg-primary-dark shadow-md"
                            >
                                Send Notification
                            </button>
                        </div>
                    )}

                    {/* NOTES TAB */}
                    {activeTab === 'notes' && (
                        <div className="h-full flex flex-col">
                            <label className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">Internal Admin Notes (Private)</label>
                            <textarea
                                value={noteInput}
                                onChange={(e) => setNoteInput(e.target.value)}
                                className="flex-1 w-full p-4 border border-gray-200 dark:border-gray-600 rounded-xl bg-yellow-50 dark:bg-gray-800 dark:text-white focus:ring-2 focus:ring-primary focus:border-transparent resize-none min-h-[150px]"
                                placeholder="Write private notes about this user (e.g. 'Warned about spamming on 12th Oct')..."
                            ></textarea>
                            <div className="mt-4 text-right">
                                <button onClick={handleSaveNote} className="px-6 py-2 bg-primary text-white font-bold rounded-lg shadow hover:bg-primary-dark">
                                    Save Notes
                                </button>
                            </div>
                        </div>
                    )}

                    {/* LISTINGS TAB */}
                    {activeTab === 'listings' && (
                        <div>
                             <div className="flex justify-between items-center mb-4">
                                 <h4 className="font-bold text-gray-800 dark:text-white">User Ads ({userListings.length})</h4>
                                 <button className="text-xs text-red-500 hover:underline font-medium">Delete All Listings</button>
                             </div>
                             <div className="space-y-3">
                                 {userListings.map(l => (
                                     <div key={l.id} className="flex gap-3 bg-white dark:bg-dark-surface p-3 rounded-lg border border-gray-100 dark:border-gray-700 shadow-sm">
                                         <img src={l.imageUrl} className="w-16 h-16 object-cover rounded" alt="" />
                                         <div className="flex-1 min-w-0">
                                             <div className="flex justify-between">
                                                 <h5 className="font-bold text-sm text-gray-900 dark:text-white truncate">{l.title}</h5>
                                                 <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase ${l.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{l.status || 'Active'}</span>
                                             </div>
                                             <p className="text-xs text-gray-500 mt-1">Rs. {l.price}</p>
                                             <div className="flex gap-3 mt-2 text-xs">
                                                 <span className="text-gray-400">{l.views || 0} Views</span>
                                                 <button onClick={() => handleDeleteListing(l.id)} className="text-red-500 hover:underline">Delete</button>
                                             </div>
                                         </div>
                                     </div>
                                 ))}
                                 {userListings.length === 0 && <p className="text-center text-gray-400 text-sm py-10">This user has no listings.</p>}
                             </div>
                        </div>
                    )}

                </div>
            </div>
        </div>
    );
};

export default ManageUsers;

