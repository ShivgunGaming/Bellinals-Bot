const { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder, PermissionFlagsBits } = require('discord.js')
const errorEmbed = require('../../embed/error-embed')
const successEmbed = require('../../embed/success-embed')
const { COMMON_ERROR } = require('../../embed/error-messages')
const { Collections } = require('../../db/collections-inscriptions')
const ManageChannels = require('../../db/manage-channels')

const REMOVE_COLLECTION_SELECTOR = 'removeCollectionSelector'

module.exports = {
  data: new SlashCommandBuilder()
    .setName('collection-remove')
    .setDescription('Remove a collection from the server')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    try {
      const channelId = await ManageChannels.findOne({
        where: {
          channelId: interaction.channelId,
        },
      })
      if (channelId) {
        const collections = await Collections.findAll({
          attributes: ['name', 'role', 'id'],
          where: {
            channelId: interaction.channelId,
          },
        })

        const selectList = [{ label: 'None', value: '-1' }]

        collections.forEach((collection) => {
          selectList.push({
            label: `${collection.name} (@${collection.role})`,
            value: `${collection.id}`,
          })
        })

        const row = new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId(REMOVE_COLLECTION_SELECTOR)
            .setPlaceholder('Select a collection')
            .addOptions(selectList)
        )

        const embed = successEmbed('Remove Collection', 'Choose the collection you want to remove.')

        return interaction.reply({
          embeds: [embed],
          components: [row],
          ephemeral: true,
        })
      } else {
        const embed = errorEmbed(COMMON_ERROR)
        return interaction.reply({ embeds: [embed], ephemeral: true })
      }
    } catch (error) {
      const embed = errorEmbed(error)
      return interaction.reply({ embeds: [embed], ephemeral: true })
    }
  },
  REMOVE_COLLECTION_SELECTOR,
}
