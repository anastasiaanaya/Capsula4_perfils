import { useEffect, useState } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../lib/supabase';

// ─── Constants ────────────────────────────────────────────────────────────────
const BUCKET_NAME = 'avatars';
const TABLE_NAME  = 'profiles';

export default function ProfileScreen() {
  // ─── State ──────────────────────────────────────────────────────────────────
  const [name, setName] = useState('');
  const [avatarUri, setAvatarUri] = useState(null);   // URI local (preview)
  const [avatarUrl, setAvatarUrl] = useState(null);   // URL pública Supabase
  const [address, setAddress] = useState(null);
  const [coords, setCoords] = useState(null);

  const [loadingGPS, setLoadingGPS] = useState(false);
  const [loadingPhoto, setLoadingPhoto] = useState(false);
  const [loadingSave, setLoadingSave] = useState(false);
  const [saved, setSaved] = useState(false);

  // ─── GPS: obtenir localització ───────────────────────────────────────────────
  const handleGetLocation = async () => {
    setLoadingGPS(true);
    setAddress(null);
    setCoords(null);

    // 1. Demanar permís
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Permís denegat',
        'Has denegat l\'accés a la localització. Pots canviar-ho des de la configuració del dispositiu.',
      );
      setLoadingGPS(false);
      return;
    }

    // 2. Obtenir coordenades
    const location = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    const { latitude, longitude } = location.coords;
    setCoords({ latitude, longitude });

    // 3. Geocodificació inversa
    const results = await Location.reverseGeocodeAsync({ latitude, longitude });
    if (results.length > 0) {
      const r = results[0];
      const parts = [r.street, r.streetNumber, r.city, r.region].filter(Boolean);
      setAddress(parts.join(', '));
    } else {
      setAddress(`${latitude.toFixed(5)}, ${longitude.toFixed(5)}`);
    }

    setLoadingGPS(false);
  };

  // ─── Càmera / Galeria ────────────────────────────────────────────────────────
  const pickImage = async (useCamera) => {
    // Demanar permís corresponent
    if (useCamera) {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permís denegat', 'Necessites permís per accedir a la càmera.');
        return;
      }
    } else {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permís denegat', 'Necessites permís per accedir a la galeria.');
        return;
      }
    }

    const fn = useCamera
      ? ImagePicker.launchCameraAsync
      : ImagePicker.launchImageLibraryAsync;

    const result = await fn({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],  // quadrat
      quality: 0.7,
    });

    if (!result.canceled) {
      setAvatarUri(result.assets[0].uri);
      setAvatarUrl(null); // reset URL pública fins que es pugi
      setSaved(false);
    }
  };

  const showImageOptions = () => {
    Alert.alert('Foto de perfil', 'Escull una opció:', [
      { text: 'Càmera',  onPress: () => pickImage(true)  },
      { text: 'Galeria', onPress: () => pickImage(false) },
      { text: 'Cancel·lar', style: 'cancel' },
    ]);
  };

  // ─── Pujar foto a Supabase Storage ──────────────────────────────────────────
  const uploadAvatar = async () => {
    if (!avatarUri) return null;

    setLoadingPhoto(true);

    // Llegir la imatge com a blob
    const response  = await fetch(avatarUri);
    const blob      = await response.blob();
    const ext       = avatarUri.split('.').pop() || 'jpg';
    const fileName  = `avatar_${Date.now()}.${ext}`;

    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(fileName, blob, { contentType: `image/${ext}` });

    if (error) {
      Alert.alert('Error pujant la foto', error.message);
      setLoadingPhoto(false);
      return null;
    }

    // Obtenir URL pública
    const { data: urlData } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(data.path);

    setLoadingPhoto(false);
    return urlData.publicUrl;
  };

  // ─── Guardar perfil a Supabase DB ────────────────────────────────────────────
  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Falta el nom', 'Escriu el teu nom abans de guardar.');
      return;
    }

    setLoadingSave(true);

    // Pujar foto si n'hi ha una de nova (local)
    let finalAvatarUrl = avatarUrl;
    if (avatarUri && !avatarUrl) {
      finalAvatarUrl = await uploadAvatar();
      if (!finalAvatarUrl) {
        setLoadingSave(false);
        return;
      }
      setAvatarUrl(finalAvatarUrl);
    }

    // Guardar a la taula 'profiles'
    const { error } = await supabase.from(TABLE_NAME).upsert({
      username:   name.trim(),
      avatar_url: finalAvatarUrl,
      address:    address,
      latitude:   coords?.latitude  ?? null,
      longitude:  coords?.longitude ?? null,
      updated_at: new Date().toISOString(),
    });

    setLoadingSave(false);

    if (error) {
      Alert.alert('Error guardant el perfil', error.message);
    } else {
      setSaved(true);
      Alert.alert('✅ Perfil guardat', 'Les teves dades s\'han guardat correctament a Supabase.');
    }
  };


  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>

      {/* Avatar */}
      <TouchableOpacity style={styles.avatarWrapper} onPress={showImageOptions}>
        {avatarUri ? (
          <Image source={{ uri: avatarUri }} style={styles.avatar} />
        ) : (
          <View style={styles.avatarPlaceholder}>
            <Text style={styles.avatarPlaceholderText}>+{'\n'}Foto</Text>
          </View>
        )}
        <View style={styles.avatarBadge}>
          <Text style={styles.avatarBadgeText}>✎</Text>
        </View>
      </TouchableOpacity>

      {loadingPhoto && (
        <View style={styles.uploadingRow}>
          <ActivityIndicator size="small" color="#6c63ff" />
          <Text style={styles.uploadingText}>Pujant foto…</Text>
        </View>
      )}

      {/* Nom */}
      <Text style={styles.label}>Nom</Text>
      <TextInput
        style={styles.input}
        placeholder="El teu nom o àlies"
        placeholderTextColor="#888"
        value={name}
        onChangeText={(t) => { setName(t); setSaved(false); }}
      />

      {/* Localització */}
      <Text style={styles.label}>Localització</Text>

      <TouchableOpacity
        style={[styles.button, styles.buttonSecondary]}
        onPress={handleGetLocation}
        disabled={loadingGPS}
      >
        {loadingGPS ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>📍 Obtenir localització actual</Text>
        )}
      </TouchableOpacity>

      {address && (
        <View style={styles.addressCard}>
          <Text style={styles.addressLabel}>Adreça detectada:</Text>
          <Text style={styles.addressText}>{address}</Text>
          {coords && (
            <Text style={styles.coordsText}>
              {coords.latitude.toFixed(5)}, {coords.longitude.toFixed(5)}
            </Text>
          )}
        </View>
      )}

      {/* Guardar */}
      <TouchableOpacity
        style={[styles.button, styles.buttonPrimary, saved && styles.buttonSaved]}
        onPress={handleSave}
        disabled={loadingSave}
      >
        {loadingSave ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>
            {saved ? '✅ Guardat!' : '💾 Guardar perfil'}
          </Text>
        )}
      </TouchableOpacity>

      {/* Info URL pública */}
      {avatarUrl && (
        <View style={styles.urlCard}>
          <Text style={styles.urlLabel}>URL pública de l'avatar:</Text>
          <Text style={styles.urlText} numberOfLines={3}>{avatarUrl}</Text>
        </View>
      )}

    </ScrollView>
  );
}


const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  content: {
    padding: 24,
    alignItems: 'center',
    paddingBottom: 48,
  },

  // Avatar
  avatarWrapper: {
    marginBottom: 24,
    position: 'relative',
  },
  avatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 3,
    borderColor: '#6c63ff',
  },
  avatarPlaceholder: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#ddd',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#bbb',
    borderStyle: 'dashed',
  },
  avatarPlaceholderText: {
    color: '#888',
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 22,
  },
  avatarBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: '#6c63ff',
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  avatarBadgeText: {
    color: '#fff',
    fontSize: 14,
  },

  // Upload
  uploadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  uploadingText: {
    color: '#6c63ff',
    fontSize: 14,
  },

  // Form
  label: {
    alignSelf: 'flex-start',
    fontSize: 13,
    fontWeight: '600',
    color: '#555',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  input: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: '#222',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },

  // Buttons
  button: {
    width: '100%',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 12,
  },
  buttonPrimary: {
    backgroundColor: '#6c63ff',
    marginTop: 8,
  },
  buttonSecondary: {
    backgroundColor: '#2196f3',
  },
  buttonSaved: {
    backgroundColor: '#4caf50',
  },
  buttonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },

  // Address card
  addressCard: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 14,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#2196f3',
  },
  addressLabel: {
    fontSize: 12,
    color: '#888',
    marginBottom: 4,
  },
  addressText: {
    fontSize: 15,
    color: '#222',
    fontWeight: '500',
  },
  coordsText: {
    fontSize: 12,
    color: '#aaa',
    marginTop: 4,
    fontFamily: 'monospace',
  },

  // URL card
  urlCard: {
    width: '100%',
    backgroundColor: '#e8f5e9',
    borderRadius: 10,
    padding: 14,
    marginTop: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#4caf50',
  },
  urlLabel: {
    fontSize: 12,
    color: '#555',
    marginBottom: 4,
  },
  urlText: {
    fontSize: 11,
    color: '#2e7d32',
    fontFamily: 'monospace',
  },
});
