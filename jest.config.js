export default {
    testEnvironment: 'jsdom',
    extensionsToTreatAsEsm: ['.ts', '.tsx', '.jsx'],
    moduleNameMapper: {
        '^firebase/auth$': '<rootDir>/src/__mocks__/firebaseAuth.js',
        '^firebase/firestore$': '<rootDir>/src/__mocks__/firebaseFirestore.js',
        '^firebase/app$': '<rootDir>/src/__mocks__/firebaseApp.js',
        '^.*/lib/firebase.*$': '<rootDir>/src/__mocks__/libFirebase.js',
        'useSocket': '<rootDir>/src/__mocks__/useSocket.js',
        '^cubing/.*$': '<rootDir>/src/__mocks__/cubing.js',
    },
};
