import invitations from '@/invitations/api/invitations'
import router from '@/base/router'
import { createMetaModule, withMeta, metaStatuses, indexById } from '@/utils/datastore/helpers'

function initialState () {
  return {
    entries: {},
  }
}

export default {
  namespaced: true,
  modules: { meta: createMetaModule() },
  state: initialState(),
  getters: {
    get: (state, getters) => id => {
      return getters.enrich(state.entries[id])
    },
    enrich: (state, getters, rootState, rootGetters) => invitation => {
      if (!invitation) return
      return {
        ...invitation,
        invitedBy: rootGetters['users/get'](invitation.invitedBy),
        group: rootGetters['groups/get'](invitation.group),
      }
    },
    all: (state, getters, rootState, rootGetters) => {
      return Object.values(state.entries).map(getters.enrich).sort(sortByCreatedAt)
    },
    byCurrentGroup: (state, getters) => {
      return getters.all.filter(({ group }) => group && group.isCurrentGroup)
    },
    ...metaStatuses(['fetch', 'send', 'accept']),
  },
  actions: {
    ...withMeta({
      /**
       * Fetch sent invitations for current group
       */
      async fetch ({ commit }, { groupId }) {
        commit('update', await invitations.listByGroupId(groupId))
      },

      /**
       * Send or resend invitation to e-mail
       */
      async send ({ commit, dispatch, rootGetters }, email) {
        const invitees = await invitations.listByGroupId(rootGetters['currentGroup/id'])

        const invitation = invitees.find((invitation) => invitation.email === email)

        if (invitation) {
          try {
            await invitations.resendEmail(invitation.id)
            dispatch('toasts/show', {
              message: 'GROUP.INVITE_SEND_SUCCESS',
            }, { root: true })
          }
          catch (error) {
            dispatch('toasts/show', {
              message: 'GROUP.INVITE_SEND_ERROR',
              config: {
                icon: 'warning',
                color: 'negative',
              },
            }, { root: true })
            throw error
          }
        }
        else {
          try {
            const invited = await invitations.create({
              email,
              group: rootGetters['currentGroup/id'],
            })
            commit('update', [invited])
            dispatch('toasts/show', {
              message: 'GROUP.INVITE_SEND_SUCCESS',
            }, { root: true })
          }
          catch (error) {
            dispatch('toasts/show', {
              message: 'GROUP.INVITE_SEND_ERROR',
              config: {
                icon: 'warning',
                color: 'negative',
              },
            }, { root: true })
            throw error
          }
        }
      },
    }, {
      findId: () => null,
    }),
    ...withMeta({
      /**
       * Fetch sent invitations for current group
       */
      async fetch ({ commit }, { groupId }) {
        commit('update', await invitations.listByGroupId(groupId))
      },

      /**
       * Accept invitation with token
       */
      async accept ({ dispatch }, token) {
        try {
          await invitations.accept(token)
          // Current group has changed, refresh user data
          await dispatch('auth/refresh', { root: true })
          dispatch('toasts/show', {
            message: 'GROUP.INVITATION_ACCEPT_SUCCESS',
          }, { root: true })
          router.push('/').catch(() => {})
        }
        catch (error) {
          dispatch('toasts/show', {
            message: 'GROUP.INVITATION_ACCEPT_ERROR',
            config: {
              icon: 'warning',
              color: 'negative',
            },
          }, { root: true })
          router.push({ name: 'groupsGallery' }).catch(() => {})
          throw error
        }
      },
    }),

    refresh ({ dispatch, rootGetters }) {
      const groupId = rootGetters['currentGroup/id']
      if (groupId) {
        dispatch('fetch', { groupId })
      }
    },

  },
  mutations: {
    update (state, invitations) {
      state.entries = Object.freeze({ ...state.entries, ...indexById(invitations) })
    },
    delete (state, id) {
      const { [id]: _, ...rest } = state.entries
      Object.freeze(rest)
      state.entries = rest
    },
    clear (state) {
      Object.assign(state, initialState())
    },
  },
}

export function sortByCreatedAt (a, b) {
  return b.createdAt - a.createdAt
}

export const plugin = datastore => {
  datastore.watch((state, getters) => getters['auth/isLoggedIn'], isLoggedIn => {
    if (!isLoggedIn) {
      datastore.commit('invitations/clear')
    }
  })
}
