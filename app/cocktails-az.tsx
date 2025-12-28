
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Modal,
  Image,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { employeeColors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase } from '@/app/integrations/supabase/client';

interface Cocktail {
  id: string;
  name: string;
  alcohol_type: string;
  ingredients: string;
  procedure: string;
  thumbnail_url: string | null;
  display_order: number;
  is_active: boolean;
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

export default function CocktailsAZScreen() {
  const router = useRouter();
  const [cocktails, setCocktails] = useState<Cocktail[]>([]);
  const [filteredCocktails, setFilteredCocktails] = useState<Cocktail[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLetter, setSelectedLetter] = useState<string | null>(null);
  const [selectedCocktail, setSelectedCocktail] = useState<Cocktail | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

  useEffect(() => {
    loadCocktails();
  }, []);

  useEffect(() => {
    filterCocktails();
  }, [cocktails, searchQuery, selectedLetter]);

  const loadCocktails = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('cocktails')
        .select('*')
        .eq('is_active', true)
        .order('name', { ascending: true });

      if (error) throw error;
      console.log('Loaded cocktails:', data);
      setCocktails(data || []);
    } catch (error) {
      console.error('Error loading cocktails:', error);
    } finally {
      setLoading(false);
    }
  };

  const filterCocktails = () => {
    let filtered = cocktails;

    // Filter by selected letter
    if (selectedLetter) {
      filtered = filtered.filter(cocktail =>
        cocktail.name.toUpperCase().startsWith(selectedLetter)
      );
    }

    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        cocktail =>
          cocktail.name.toLowerCase().includes(query) ||
          cocktail.ingredients.toLowerCase().includes(query) ||
          cocktail.alcohol_type.toLowerCase().includes(query)
      );
    }

    setFilteredCocktails(filtered);
  };

  const openDetailModal = (cocktail: Cocktail) => {
    setSelectedCocktail(cocktail);
    setShowDetailModal(true);
  };

  const closeDetailModal = () => {
    setShowDetailModal(false);
    setSelectedCocktail(null);
  };

  const handleBackPress = () => {
    router.back();
  };

  // Helper function to get image URL with cache busting
  const getImageUrl = (url: string | null) => {
    if (!url) return null;
    return `${url}?t=${Date.now()}`;
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBackPress} style={styles.backButton}>
          <IconSymbol
            ios_icon_name="chevron.left"
            android_material_icon_name="arrow-back"
            size={24}
            color={employeeColors.text}
          />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Cocktails A-Z</Text>
        <View style={styles.backButton} />
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <IconSymbol
          ios_icon_name="magnifyingglass"
          android_material_icon_name="search"
          size={20}
          color={employeeColors.textSecondary}
        />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name, ingredient, or alcohol type..."
          placeholderTextColor={employeeColors.textSecondary}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <IconSymbol
              ios_icon_name="xmark.circle.fill"
              android_material_icon_name="cancel"
              size={20}
              color={employeeColors.textSecondary}
            />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.contentContainer}>
        {/* Cocktails List */}
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={employeeColors.primary} />
          </View>
        ) : (
          <ScrollView style={styles.cocktailsList} contentContainerStyle={styles.cocktailsListContent}>
            {filteredCocktails.length === 0 ? (
              <View style={styles.emptyContainer}>
                <IconSymbol
                  ios_icon_name="wineglass"
                  android_material_icon_name="local-bar"
                  size={64}
                  color={employeeColors.textSecondary}
                />
                <Text style={styles.emptyText}>No cocktails found</Text>
                <Text style={styles.emptySubtext}>
                  Try adjusting your search or filter
                </Text>
              </View>
            ) : (
              filteredCocktails.map((cocktail, index) => (
                <TouchableOpacity
                  key={index}
                  style={styles.cocktailCard}
                  onPress={() => openDetailModal(cocktail)}
                >
                  <View style={styles.cocktailInfo}>
                    <Text style={styles.cocktailName}>{cocktail.name}</Text>
                    <Text style={styles.cocktailAlcoholType}>{cocktail.alcohol_type}</Text>
                  </View>
                  <IconSymbol
                    ios_icon_name="chevron.right"
                    android_material_icon_name="chevron-right"
                    size={20}
                    color={employeeColors.textSecondary}
                  />
                </TouchableOpacity>
              ))
            )}
          </ScrollView>
        )}

        {/* Alphabetical Navigation Bar */}
        <View style={styles.alphabetNav}>
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.alphabetNavContent}
          >
            <TouchableOpacity
              style={[
                styles.alphabetButton,
                selectedLetter === null && styles.alphabetButtonActive,
              ]}
              onPress={() => setSelectedLetter(null)}
            >
              <Text
                style={[
                  styles.alphabetButtonText,
                  selectedLetter === null && styles.alphabetButtonTextActive,
                ]}
              >
                All
              </Text>
            </TouchableOpacity>
            {ALPHABET.map((letter, index) => (
              <TouchableOpacity
                key={index}
                style={[
                  styles.alphabetButton,
                  selectedLetter === letter && styles.alphabetButtonActive,
                ]}
                onPress={() => setSelectedLetter(letter)}
              >
                <Text
                  style={[
                    styles.alphabetButtonText,
                    selectedLetter === letter && styles.alphabetButtonTextActive,
                  ]}
                >
                  {letter}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </View>

      {/* Detail Modal */}
      <Modal
        visible={showDetailModal}
        animationType="slide"
        transparent={true}
        onRequestClose={closeDetailModal}
      >
        <View style={styles.modalContainer}>
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={closeDetailModal}
          />
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{selectedCocktail?.name}</Text>
              <TouchableOpacity onPress={closeDetailModal}>
                <IconSymbol
                  ios_icon_name="xmark.circle.fill"
                  android_material_icon_name="cancel"
                  size={28}
                  color="#666666"
                />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.modalScroll}
              contentContainerStyle={styles.modalScrollContent}
              showsVerticalScrollIndicator={true}
            >
              {selectedCocktail?.thumbnail_url && (
                <Image
                  source={{ uri: getImageUrl(selectedCocktail.thumbnail_url) }}
                  style={styles.modalImage}
                  resizeMode="cover"
                />
              )}

              <View style={styles.detailSection}>
                <Text style={styles.detailLabel}>Alcohol Type</Text>
                <View style={styles.alcoholTypeBadge}>
                  <Text style={styles.alcoholTypeText}>{selectedCocktail?.alcohol_type}</Text>
                </View>
              </View>

              <View style={styles.detailSection}>
                <Text style={styles.detailLabel}>Ingredients</Text>
                <Text style={styles.detailText}>{selectedCocktail?.ingredients}</Text>
              </View>

              <View style={styles.detailSection}>
                <Text style={styles.detailLabel}>Procedure</Text>
                <Text style={styles.detailText}>{selectedCocktail?.procedure}</Text>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: employeeColors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? 48 : 60,
    paddingBottom: 12,
    backgroundColor: employeeColors.card,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.1)',
    elevation: 3,
  },
  backButton: {
    padding: 8,
    width: 40,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: employeeColors.text,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: employeeColors.card,
    marginHorizontal: 16,
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.1)',
    elevation: 3,
  },
  searchInput: {
    flex: 1,
    marginLeft: 12,
    fontSize: 16,
    color: employeeColors.text,
  },
  contentContainer: {
    flex: 1,
    flexDirection: 'row',
    marginTop: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cocktailsList: {
    flex: 1,
    paddingLeft: 16,
  },
  cocktailsListContent: {
    paddingRight: 8,
    paddingBottom: 100,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: employeeColors.text,
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: employeeColors.textSecondary,
    marginTop: 8,
    textAlign: 'center',
  },
  cocktailCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: employeeColors.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.1)',
    elevation: 3,
  },
  cocktailInfo: {
    flex: 1,
  },
  cocktailName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: employeeColors.text,
    marginBottom: 4,
  },
  cocktailAlcoholType: {
    fontSize: 14,
    color: employeeColors.textSecondary,
  },
  alphabetNav: {
    width: 40,
    backgroundColor: employeeColors.card,
    borderTopLeftRadius: 12,
    borderBottomLeftRadius: 12,
    marginRight: 16,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.1)',
    elevation: 3,
  },
  alphabetNavContent: {
    paddingVertical: 8,
    alignItems: 'center',
  },
  alphabetButton: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 2,
    borderRadius: 16,
  },
  alphabetButtonActive: {
    backgroundColor: employeeColors.primary,
  },
  alphabetButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: employeeColors.textSecondary,
  },
  alphabetButtonTextActive: {
    color: employeeColors.text,
  },
  modalContainer: {
    flex: 1,
    justifyContent: 'flex-start',
  },
  modalBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    height: '90%',
    marginTop: 'auto',
    boxShadow: '0px -4px 20px rgba(0, 0, 0, 0.4)',
    elevation: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
    backgroundColor: '#FFFFFF',
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1A1A1A',
    flex: 1,
  },
  modalScroll: {
    flex: 1,
  },
  modalScrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  modalImage: {
    width: '100%',
    height: 250,
    borderRadius: 16,
    marginBottom: 24,
  },
  detailSection: {
    marginBottom: 24,
  },
  detailLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1A1A1A',
    marginBottom: 8,
  },
  alcoholTypeBadge: {
    alignSelf: 'flex-start',
    backgroundColor: employeeColors.primary,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  alcoholTypeText: {
    fontSize: 14,
    fontWeight: '600',
    color: employeeColors.text,
  },
  detailText: {
    fontSize: 15,
    color: '#333333',
    lineHeight: 24,
    whiteSpace: 'pre-line',
  },
});
