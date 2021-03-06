import offers from '@/offers/api/offers'
import {
  createMetaModule,
  withMeta,
  metaStatusesWithId,
  createPaginationModule,
  metaStatuses, indexById,
} from '@/utils/datastore/helpers'
import router from '@/base/router'

export const DEFAULT_STATUS = 'active'

function initialState () {
  return {
    entries: {},
    filter: {
      status: DEFAULT_STATUS,
    },
  }
}

function sortByCreatedAtDesc (a, b) {
  return b.createdAt - a.createdAt
}

export default {
  namespaced: true,
  modules: {
    meta: createMetaModule(),
    pagination: createPaginationModule(),
  },
  state: initialState(),
  getters: {
    ...metaStatuses(['create']),
    get: (state, getters) => offerId => {
      return getters.enrich(state.entries[offerId])
    },
    enrich: (state, getters, rootState, rootGetters) => offer => {
      if (!offer) return
      return {
        ...offer,
        canEdit: rootGetters['auth/userId'] === offer.user,
        user: rootGetters['users/get'](offer.user),
        group: rootGetters['groups/get'](offer.group),
        ...metaStatusesWithId(getters, ['save'], offer.id),
      }
    },
    all: (state, getters) => {
      return Object.values(state.entries)
        .filter(offer => offer.status === state.filter.status)
        .map(getters.enrich)
        .sort(sortByCreatedAtDesc)
    },
    fetching: (state, getters) => getters['meta/status']('fetchList').pending,
    fetchingMore: (state, getters) => getters['meta/status']('fetchMore').pending,
    canFetchMore: (state, getters) => getters['pagination/canFetchNext'],
  },
  actions: {
    ...withMeta({
      async fetchList ({ state, rootGetters, dispatch, commit }, { status = 'active' }) {
        commit('setFilter', { status })
        const group = rootGetters['currentGroup/id']
        const entries = await dispatch('pagination/extractCursor', offers.list({ ...state.filter, group }))
        commit('update', entries)
      },
      async fetchMore ({ commit, dispatch }) {
        const entries = await dispatch('pagination/fetchNext', offers.listMore)
        commit('update', entries)
      },
    }),
    refresh ({ state, dispatch }) {
      dispatch('fetchList', state.filter)
    },
    clear ({ commit }) {
      commit('clear')
    },
    ...withMeta({
      async create ({ getters, rootGetters, dispatch, commit }, data) {
        const newOffer = await offers.create({
          ...data,
          group: rootGetters['currentGroup/id'],
        })
        commit('update', [newOffer])
        router.push({
          name: 'offerDetail',
          params: {
            groupId: newOffer.group,
            offerId: newOffer.id,
          },
          query: router.currentRoute.query,
        }).catch(() => {})
      },

      async save ({ getters, state, dispatch, commit }, data) {
        const updatedOffer = await offers.save(data)
        commit('update', [updatedOffer])
        commit('currentOffer/update', updatedOffer, { root: true })
        router.push({
          name: 'offerDetail',
          params: {
            groupId: updatedOffer.group,
            offerId: updatedOffer.id,
          },
          query: router.currentRoute.query,
        }).catch(() => {})
      },
    }),

    ...withMeta({
      async archive ({ state, commit, dispatch }, { offerId }) {
        const updatedOffer = await offers.archive(offerId)
        commit('update', [updatedOffer])
        commit('currentOffer/update', updatedOffer, { root: true })
        dispatch('refresh')
      },
    }, {
      findId: ({ offerId }) => offerId,
    }),
  },
  mutations: {
    clear (state) {
      Object.assign(state, initialState())
    },
    update (state, offers) {
      state.entries = Object.freeze({ ...state.entries, ...indexById(offers) })
    },
    delete (state, id) {
      if (!state.entries[id]) return
      const { [id]: _, ...rest } = state.entries
      Object.freeze(rest)
      state.entries = rest
    },
    setFilter (state, data) {
      state.entries = {}
      state.filter = data
    },
  },
}

export const plugin = datastore => {
  datastore.watch((state, getters) => getters['auth/isLoggedIn'], isLoggedIn => {
    if (!isLoggedIn) {
      datastore.commit('offers/clear')
      datastore.commit('offers/pagination/clear')
    }
  })
}
