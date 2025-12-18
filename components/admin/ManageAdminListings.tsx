
import React, { useState, useEffect } from 'react';
import { Listing } from '../../types';
import { CATEGORIES, PAKISTAN_LOCATIONS } from '../../constants';
import { doc, updateDoc, deleteDoc, arrayRemove } from 'firebase/firestore';
import { db } from '../../firebaseConfig';

interface ManageAdminListingsProps {
  listings: Listing[];
  onDeleteListing: (listingId: string) => void;
  onNavigate: (view: string, payload?: any) => void;
}

const ManageAdminListings: React.FC<ManageAdminListingsProps> = ({ listings, onDeleteListing, onNavigate }) => {
  // --- STATE ---
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [selectedStatus, setSelectedStatus] = useState<string>('All');
  const [selectedLocation, setSelectedLocation] = useState<string>('All');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest' | 'price-high' | 'price-low'>('newest');
  
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editingListing, setEditingListing] = useState<Listing | null>(null);

  // --- FILTERING LOGIC ---
  const filteredListings = listings.filter(listing => {
    // 1. Search (Title, ID, Vendor, Phone)
    const term = searchTerm.toLowerCase();
    const matchesSearch = 
        listing.title.toLowerCase().includes(term) ||
        listing.id.toLowerCase().includes(term) ||
        listing.vendorName.toLowerCase().includes(term) ||
        listing.contact?.phone?.includes(term);

    // 2. Category
    const matchesCategory = selectedCategory === 'All' || listing.category === selectedCategory;

    // 3. Status
    const matchesStatus = selectedStatus === 'All' || (listing.status || 'active') === selectedStatus;

    // 4. Location (Simple includes check for City or Province)
    const matchesLocation = selectedLocation === 'All' || listing.location.includes(selectedLocation);

    return matchesSearch && matchesCategory && matchesStatus && matchesLocation;
  }).sort((a, b) => {
      // 5. Sorting
      if (sortOrder === 'newest') return (new Date(b.createdAt || 0).getTime()) - (new Date(a.createdAt || 0).getTime());
      if (sortOrder === 'oldest') return (new Date(a.createdAt || 0).getTime()) - (new Date(b.createdAt || 0).getTime());
      if (sortOrder === 'price-high') return b.price - a.price;
      if (sortOrder === 'price-low') return a.price - b.price;
      return 0;
  });

  // --- ACTIONS ---

  const handleBulkAction = async (action: 'delete' | 'approve' | 'reject') => {
      if (selectedIds.size === 0) return;
      if (!window.confirm(`Are you sure you want to ${action} ${selectedIds.size} listings?`)) return;

      const updates = Array.from(selectedIds).map(async (id) => {
          if (!db) return;
          const ref = doc(db, 'listings', id);
          if (action === 'delete') {
              await deleteDoc(ref);
          } else if (action === 'approve') {
              await updateDoc(ref, { status: 'active' });
          } else if (action === 'reject') {
              await updateDoc(ref, { status: 'rejected' });
          }
      });

      await Promise.all(updates);
      setSelectedIds(new Set()); // Clear selection
      alert(`Bulk ${action} complete.`);
  };

  const toggleSelectAll = () => {
      if (selectedIds.size === filteredListings.length) {
          setSelectedIds(new Set());
      } else {
          setSelectedIds(new Set(filteredListings.map(l => l.id)));
      }
  };

  const toggleSelectOne = (id: string) => {
      const newSet = new Set(selectedIds);
      if (newSet.has(id)) newSet.delete(id);
      else newSet.add(id);
      setSelectedIds(newSet);
  };

  const updateStatus = async (id: string, newStatus: string) => {
      if (!db) return;
      try {
          await updateDoc(doc(db, 'listings', id), { status: newStatus });
      } catch (e: any) {
          console.error("Error updating status:", e.message);
      }
  };

  const togglePromoted = async (listing: Listing) => {
      if (!db) return;
      try {
          await updateDoc(doc(db, 'listings', listing.id), { isPromoted: !listing.isPromoted });
      } catch (e: any) {
          console.error("Error toggling promotion:", e.message);
      }
  };

  // --- EDIT MODAL HANDLERS ---
  const handleSaveEdit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!editingListing || !db) return;

      try {
          await updateDoc(doc(db, 'listings', editingListing.id), {
              title: editingListing.title,
              price: Number(editingListing.price),
              category: editingListing.category,
              status: editingListing.status
          });
          setEditingListing(null);
          alert("Listing updated successfully.");
      } catch (e: any) {
          console.error("Update failed:", e.message);
          alert("Failed to update listing.");
      }
  };

  const handleDeleteImage = async (imgUrl: string) => {
      if (!editingListing || !db) return;
      if (!window.confirm("Remove this image?")) return;

      try {
          await updateDoc(doc(db, 'listings', editingListing.id), {
              images: arrayRemove(imgUrl)
          });
          // Update local state to reflect change immediately in modal
          setEditingListing(prev => prev ? ({
              ...prev,
              images: prev.images?.filter(i => i !== imgUrl)
          }) : null);
      } catch (e: any) {
          console.error("Image removal failed:", e.message);
      }
  };

  return (
    <div>
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
        <h2 className="text-3xl font-bold text-gray-800 dark:text-white">Manage Listings</h2>
        
        {/* Bulk Action Toolbar - Only Visible when items selected */}
        {selectedIds.size > 0 && (
            <div className="flex items-center gap-2 bg-blue-50 dark:bg-blue-900/30 px-4 py-2 rounded-lg border border-blue-200 dark:border-blue-800 animate-fade-in">
                <span className="text-sm font-bold text-blue-800 dark:text-blue-200">{selectedIds.size} Selected</span>
                <button onClick={() => handleBulkAction('approve')} className="px-3 py-1 bg-green-600 text-white text-xs rounded hover:bg-green-700 ml-2">Approve</button>
                <button onClick={() => handleBulkAction('reject')} className="px-3 py-1 bg-orange-500 text-white text-xs rounded hover:bg-orange-600">Reject</button>
                <button onClick={() => handleBulkAction('delete')} className="px-3 py-1 bg-red-600 text-white text-xs rounded hover:bg-red-700">Delete</button>
            </div>
        )}
      </div>

      {/* Advanced Filters Bar */}
      <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-xl mb-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          
          {/* Search */}
          <div className="lg:col-span-1">
              <input
                type="text"
                placeholder="Search Title, ID, Vendor..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm focus:ring-primary focus:border-primary"
              />
          </div>

          {/* Category Filter */}
          <div>
              <select 
                value={selectedCategory} 
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm"
              >
                  <option value="All">All Categories</option>
                  {CATEGORIES.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
              </select>
          </div>

          {/* Status Filter */}
          <div>
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm"
              >
                  <option value="All">All Statuses</option>
                  <option value="active">Active</option>
                  <option value="pending">Pending Approval</option>
                  <option value="draft">Draft</option>
                  <option value="rejected">Rejected</option>
                  <option value="sold">Sold</option>
              </select>
          </div>

          {/* Location Filter */}
          <div>
              <select
                value={selectedLocation}
                onChange={(e) => setSelectedLocation(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm"
              >
                  <option value="All">All Locations</option>
                  {Object.keys(PAKISTAN_LOCATIONS).map(prov => <option key={prov} value={prov}>{prov}</option>)}
              </select>
          </div>

          {/* Sort */}
          <div>
              <select
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value as any)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm font-semibold text-gray-700 dark:text-gray-200"
              >
                  <option value="newest">Newest First</option>
                  <option value="oldest">Oldest First</option>
                  <option value="price-high">Price: High to Low</option>
                  <option value="price-low">Price: Low to High</option>
              </select>
          </div>
      </div>

      {/* Listings Table */}
      <div className="overflow-x-auto bg-white dark:bg-dark-surface rounded-lg shadow border border-gray-200 dark:border-gray-700">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-100 dark:bg-gray-800">
            <tr>
              <th scope="col" className="px-4 py-3 text-left">
                  <input type="checkbox" onChange={toggleSelectAll} checked={selectedIds.size === filteredListings.length && filteredListings.length > 0} />
              </th>
              <th scope="col" className="px-4 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-300 uppercase tracking-wider">Listing Info</th>
              <th scope="col" className="px-4 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-300 uppercase tracking-wider">Vendor</th>
              <th scope="col" className="px-4 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-300 uppercase tracking-wider">Status & Price</th>
              <th scope="col" className="px-4 py-3 text-left text-xs font-bold text-gray-500 dark:text-gray-300 uppercase tracking-wider">Insights</th>
              <th scope="col" className="px-4 py-3 text-right text-xs font-bold text-gray-500 dark:text-gray-300 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {filteredListings.map((listing) => (
              <tr key={listing.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                <td className="px-4 py-4 whitespace-nowrap">
                    <input 
                        type="checkbox" 
                        checked={selectedIds.has(listing.id)} 
                        onChange={() => toggleSelectOne(listing.id)}
                    />
                </td>
                <td className="px-4 py-4">
                    <div className="flex items-start gap-3">
                        <div className="relative h-16 w-16 flex-shrink-0">
                            <img className="h-16 w-16 rounded-lg object-cover border border-gray-200 dark:border-gray-600" src={listing.imageUrl} alt={listing.title} />
                            {listing.isPromoted && (
                                <span className="absolute -top-2 -left-2 bg-yellow-400 text-white text-[9px] font-bold px-1.5 py-0.5 rounded shadow">FEATURED</span>
                            )}
                        </div>
                        <div>
                            <div className="text-sm font-bold text-gray-900 dark:text-white line-clamp-1">{listing.title}</div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">{listing.category}</div>
                            <div className="text-[10px] text-gray-400 mt-1">ID: {listing.id.slice(0, 6)}...</div>
                            <div className="text-[10px] text-gray-400">
                                {listing.createdAt ? new Date(listing.createdAt).toLocaleDateString() : 'N/A'}
                            </div>
                        </div>
                    </div>
                </td>
                <td className="px-4 py-4 whitespace-nowrap">
                  <div className="text-sm font-medium text-blue-600 dark:text-blue-400 cursor-pointer hover:underline" onClick={() => onNavigate('vendor-profile', { targetVendorId: listing.vendorId })}>
                      {listing.vendorName}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1 mt-1">
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                      <span className="truncate max-w-[120px]">{listing.location}</span>
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5">{listing.contact?.phone}</div>
                </td>
                <td className="px-4 py-4 whitespace-nowrap">
                  <div className="text-sm font-bold text-gray-900 dark:text-white">Rs.{listing.price.toLocaleString()}</div>
                  <div className="mt-1">
                      <select 
                        value={listing.status || 'active'}
                        onChange={(e) => updateStatus(listing.id, e.target.value)}
                        className={`text-xs font-semibold px-2 py-0.5 rounded-full border border-transparent focus:ring-1 focus:ring-primary outline-none cursor-pointer ${
                            (listing.status === 'active' || !listing.status) ? 'bg-green-100 text-green-800' :
                            listing.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                            listing.status === 'rejected' ? 'bg-red-100 text-red-800' :
                            listing.status === 'sold' ? 'bg-gray-200 text-gray-700 line-through' :
                            'bg-gray-100 text-gray-600'
                        }`}
                      >
                          <option value="active">Active</option>
                          <option value="pending">Pending</option>
                          <option value="rejected">Rejected</option>
                          <option value="sold">Sold</option>
                      </select>
                  </div>
                </td>
                <td className="px-4 py-4 whitespace-nowrap">
                    <div className="flex flex-col gap-1">
                        <span className="text-xs text-gray-600 dark:text-gray-300 flex items-center gap-1">
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                            {listing.views || 0} Views
                        </span>
                        <span className="text-xs text-gray-600 dark:text-gray-300 flex items-center gap-1">
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" /></svg>
                            {listing.likes || 0} Likes
                        </span>
                    </div>
                </td>
                <td className="px-4 py-4 whitespace-nowrap text-right text-sm font-medium">
                   <div className="flex flex-col gap-2 items-end">
                       <div className="flex gap-1">
                            <button 
                                onClick={() => onNavigate('details', { listing })}
                                className="p-1.5 text-blue-500 hover:bg-blue-50 rounded"
                                title="View Live"
                            >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                            </button>
                            <button 
                                onClick={() => setEditingListing(listing)}
                                className="p-1.5 text-gray-500 hover:bg-gray-100 rounded"
                                title="Edit Listing"
                            >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                            </button>
                            <button 
                                onClick={() => onDeleteListing(listing.id)}
                                className="p-1.5 text-red-500 hover:bg-red-50 rounded"
                                title="Delete Permanently"
                            >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                            </button>
                       </div>
                       
                       <button 
                            onClick={() => togglePromoted(listing)}
                            className={`text-[10px] font-bold px-2 py-0.5 rounded border ${listing.isPromoted ? 'border-yellow-500 text-yellow-600 bg-yellow-50' : 'border-gray-300 text-gray-500 hover:bg-gray-50'}`}
                        >
                           {listing.isPromoted ? '★ Featured' : '☆ Feature'}
                        </button>
                   </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filteredListings.length === 0 && (
            <div className="p-8 text-center text-gray-500 dark:text-gray-400">
                No listings found matching your filters.
            </div>
        )}
      </div>

      {/* EDIT MODAL */}
      {editingListing && (
          <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4">
              <div className="bg-white dark:bg-dark-surface rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                  <div className="p-6 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center">
                      <h3 className="text-xl font-bold text-gray-800 dark:text-white">Edit Listing</h3>
                      <button onClick={() => setEditingListing(null)} className="text-gray-400 hover:text-gray-600">✕</button>
                  </div>
                  
                  <form onSubmit={handleSaveEdit} className="p-6 space-y-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Title</label>
                              <input 
                                type="text" 
                                value={editingListing.title}
                                onChange={(e) => setEditingListing({...editingListing, title: e.target.value})}
                                className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
                              />
                          </div>
                          <div>
                              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Price</label>
                              <input 
                                type="number" 
                                value={editingListing.price}
                                onChange={(e) => setEditingListing({...editingListing, price: Number(e.target.value)})}
                                className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
                              />
                          </div>
                          <div>
                              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Category</label>
                              <select 
                                value={editingListing.category}
                                onChange={(e) => setEditingListing({...editingListing, category: e.target.value})}
                                className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
                              >
                                  {CATEGORIES.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                              </select>
                          </div>
                          <div>
                              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Status</label>
                              <select 
                                value={editingListing.status || 'active'}
                                onChange={(e) => setEditingListing({...editingListing, status: e.target.value as any})}
                                className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600"
                              >
                                  <option value="active">Active</option>
                                  <option value="pending">Pending Review</option>
                                  <option value="rejected">Rejected</option>
                                  <option value="draft">Draft</option>
                                  <option value="sold">Sold</option>
                              </select>
                          </div>
                      </div>

                      {/* Image Management */}
                      <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Manage Images</label>
                          <div className="grid grid-cols-4 gap-2">
                              {/* Combined Images Logic: Check array first, fallback to single imageUrl */}
                              {(editingListing.images && editingListing.images.length > 0 
                                  ? editingListing.images 
                                  : [editingListing.imageUrl]).map((img, idx) => (
                                  <div key={idx} className="relative group aspect-square rounded overflow-hidden border">
                                      <img src={img} className="w-full h-full object-cover" alt="" />
                                      <button 
                                        type="button"
                                        onClick={() => handleDeleteImage(img)}
                                        className="absolute top-1 right-1 bg-red-600 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow"
                                        title="Delete Image"
                                      >
                                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                      </button>
                                  </div>
                              ))}
                          </div>
                      </div>

                      <div className="flex justify-end gap-3 pt-4 border-t border-gray-100 dark:border-gray-700">
                          <button 
                            type="button"
                            onClick={() => setEditingListing(null)}
                            className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                          >
                              Cancel
                          </button>
                          <button 
                            type="submit"
                            className="px-4 py-2 bg-primary text-white font-bold rounded-lg hover:bg-primary-dark"
                          >
                              Save Changes
                          </button>
                      </div>
                  </form>
              </div>
          </div>
      )}
    </div>
  );
};

export default ManageAdminListings;
