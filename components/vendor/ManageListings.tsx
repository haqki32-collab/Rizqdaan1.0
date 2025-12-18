
import React, { useState } from 'react';
import { doc, deleteDoc, updateDoc } from 'firebase/firestore';
import { db } from '../../firebaseConfig';
import { Listing, User } from '../../types';

interface ManageListingsProps {
    listings: Listing[];
    user: User | null;
    onEdit: (listing: Listing) => void;
    onPreview: (listing: Listing) => void;
    onPromote: (listing: Listing) => void; // New Prop
}

type ListingFilter = 'all' | 'live' | 'draft' | 'featured';

const ManageListings: React.FC<ManageListingsProps> = ({ listings, user, onEdit, onPreview, onPromote }) => {
  const [activeTab, setActiveTab] = useState<ListingFilter>('all');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [optimisticallyDeletedIds, setOptimisticallyDeletedIds] = useState<Set<string>>(new Set());
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  const myListings = user 
    ? listings
        .filter(l => l.vendorId === user.id && !optimisticallyDeletedIds.has(l.id))
        .sort((a, b) => {
             const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
             const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
             return dateB - dateA; 
        })
    : [];

  const filteredListings = myListings.filter(listing => {
      const status = listing.status || 'active';
      
      if (activeTab === 'live') return status === 'active';
      if (activeTab === 'draft') return status === 'draft';
      if (activeTab === 'featured') return listing.isPromoted && status === 'active';
      return true;
  });

  const handleDeleteClick = (listingId: string) => {
      if (confirmDeleteId === listingId) {
          performDelete(listingId);
      } else {
          setConfirmDeleteId(listingId);
          setTimeout(() => {
              setConfirmDeleteId(prev => prev === listingId ? null : prev);
          }, 3000);
      }
  };

  const performDelete = async (listingId: string) => {
      if (!db) {
          alert("In Mock Mode: Item would be deleted here.");
          setConfirmDeleteId(null);
          return;
      }
      
      setDeletingId(listingId);
      setConfirmDeleteId(null);
      setErrorMsg(null);
      
      setOptimisticallyDeletedIds(prev => new Set(prev).add(listingId));

      try {
          await deleteDoc(doc(db, "listings", listingId));
      } catch (e: any) {
          console.error("Error deleting listing:", e.message);
          
          setOptimisticallyDeletedIds(prev => {
              const next = new Set(prev);
              next.delete(listingId);
              return next;
          });

          if (e.code === 'permission-denied' || e.message?.includes('permission')) {
              setErrorMsg(
                  "❌ DELETE FAILED: Permission Denied."
              );
          } else {
              setErrorMsg(`Failed to delete: ${e.message}`);
          }
      } finally {
          setDeletingId(null);
      }
  }

  if (!user) {
      return <div>Please log in to manage listings.</div>;
  }

  return (
    <div>
      <h3 className="text-2xl font-bold text-gray-800 dark:text-white mb-6">Manage Your Listings</h3>
      
      {errorMsg && (
          <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-6 rounded shadow-sm animate-fade-in relative">
              <p className="font-bold">Error</p>
              <p>{errorMsg}</p>
              <button 
                onClick={() => setErrorMsg(null)} 
                className="absolute top-2 right-2 text-red-500 hover:text-red-700 font-bold"
              >
                  ✕
              </button>
          </div>
      )}

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 mb-6 border-b border-gray-200 dark:border-gray-700 pb-2">
          {['all', 'live', 'draft', 'featured'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab as ListingFilter)}
                className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors border-b-2 ${
                    activeTab === tab
                    ? 'border-primary text-primary dark:text-white bg-gray-50 dark:bg-gray-700/50'
                    : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
                }`}
              >
                  {tab.charAt(0).toUpperCase() + tab.slice(1)} Posts 
                  <span className="ml-2 text-xs bg-gray-200 dark:bg-gray-600 px-1.5 py-0.5 rounded-full text-gray-600 dark:text-gray-300">
                    {tab === 'all' 
                        ? myListings.length 
                        : myListings.filter(l => {
                            const status = l.status || 'active';
                            if (tab === 'live') return status === 'active';
                            if (tab === 'draft') return status === 'draft';
                            if (tab === 'featured') return l.isPromoted && status === 'active';
                            return false;
                        }).length
                    }
                  </span>
              </button>
          ))}
      </div>

      {filteredListings.length === 0 ? (
           <div className="text-center py-10 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <p className="text-gray-500 dark:text-gray-400">
                  {activeTab === 'all' 
                    ? "You haven't posted any listings yet." 
                    : `No ${activeTab} listings found.`}
              </p>
           </div>
      ) : (
        <div className="space-y-6">
            {filteredListings.map(listing => (
            <div key={listing.id} className={`flex flex-col p-4 bg-white dark:bg-dark-surface rounded-xl shadow-md border ${listing.isPromoted ? 'border-yellow-400 ring-1 ring-yellow-400' : 'border-gray-200 dark:border-gray-700'}`}>
                
                {/* Top Section: Image & Info */}
                <div className="flex flex-row gap-4 mb-4">
                    <div className="relative w-24 h-24 flex-shrink-0">
                         <img src={listing.imageUrl} alt={listing.title} className="w-full h-full rounded-lg object-cover bg-gray-200" />
                         {listing.isPromoted && (
                             <span className="absolute -top-2 -left-2 bg-yellow-400 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm">FEATURED</span>
                         )}
                         {listing.status === 'draft' && (
                             <span className="absolute -top-2 -right-2 bg-gray-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm">DRAFT</span>
                         )}
                    </div>
                    
                    <div className="flex-grow">
                        <div className="flex justify-between items-start">
                             <div>
                                <h4 className="font-bold text-lg text-gray-800 dark:text-white line-clamp-1">{listing.title}</h4>
                                <p className="text-sm text-gray-500 dark:text-gray-400">{listing.category} • Rs.{listing.price}</p>
                             </div>
                             <button onClick={() => onPreview(listing)} className="text-xs text-primary hover:underline">
                                 Preview &rarr;
                             </button>
                        </div>

                        {/* Analytics Stats Grid */}
                        <div className="grid grid-cols-4 gap-2 mt-3">
                             <div className="text-center bg-gray-50 dark:bg-gray-700 rounded p-1">
                                 <span className="block text-xs text-gray-400">Views</span>
                                 <span className="font-bold text-primary dark:text-white">{listing.views || 0}</span>
                             </div>
                             <div className="text-center bg-gray-50 dark:bg-gray-700 rounded p-1">
                                 <span className="block text-xs text-gray-400">Likes</span>
                                 <span className="font-bold text-red-500">{listing.likes || 0}</span>
                             </div>
                             <div className="text-center bg-gray-50 dark:bg-gray-700 rounded p-1">
                                 <span className="block text-xs text-gray-400">Rating</span>
                                 <span className="font-bold text-yellow-500 flex items-center justify-center gap-1">
                                     {listing.rating.toFixed(1)} <span className="text-[8px]">★</span>
                                 </span>
                             </div>
                             <div className="text-center bg-gray-50 dark:bg-gray-700 rounded p-1">
                                 <span className="block text-xs text-gray-400">Reviews</span>
                                 <span className="font-bold text-gray-700 dark:text-gray-200">{listing.reviews?.length || 0}</span>
                             </div>
                        </div>
                    </div>
                </div>

                {/* Actions Buttons */}
                <div className="grid grid-cols-3 gap-3 border-t border-gray-100 dark:border-gray-700 pt-3">
                    <button 
                        onClick={() => !listing.isPromoted && onPromote(listing)}
                        disabled={listing.status === 'draft'}
                        className={`px-3 py-2 text-sm font-medium rounded-lg flex items-center justify-center gap-2 transition-colors ${
                            listing.status === 'draft'
                            ? 'bg-gray-100 text-gray-400 cursor-default' 
                            : listing.isPromoted 
                                ? 'bg-yellow-100 text-yellow-800 cursor-default border border-yellow-300'
                                : 'bg-yellow-50 text-yellow-700 hover:bg-yellow-100 border border-yellow-200 shadow-sm active:scale-95'
                        }`}
                    >
                        {listing.isPromoted ? (
                            <>
                                <svg className="w-4 h-4 text-yellow-600" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                                Featured
                            </>
                        ) : (
                            <>
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                                Promote
                            </>
                        )}
                    </button>
                    
                    <button 
                        onClick={() => onEdit(listing)}
                        className="px-3 py-2 text-sm font-medium bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 rounded-lg flex items-center justify-center gap-2 transition-colors"
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                        Edit
                    </button>
                    
                    <button 
                        onClick={() => handleDeleteClick(listing.id)}
                        disabled={deletingId === listing.id}
                        className={`px-3 py-2 text-sm font-medium rounded-lg flex items-center justify-center gap-2 transition-all ${
                            confirmDeleteId === listing.id
                            ? 'bg-red-600 text-white animate-pulse'
                            : deletingId === listing.id 
                                ? 'bg-red-100 text-red-800 cursor-not-allowed'
                                : 'bg-red-50 text-red-700 hover:bg-red-100 border border-red-200'
                        }`}
                    >
                        {deletingId === listing.id ? (
                            <svg className="animate-spin h-4 w-4 text-red-700" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                        ) : (
                            confirmDeleteId === listing.id ? null : <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        )}
                        {deletingId === listing.id ? 'Deleting...' : (confirmDeleteId === listing.id ? 'Confirm?' : 'Delete')}
                    </button>
                </div>
            </div>
            ))}
        </div>
      )}
    </div>
  );
};

export default ManageListings;
